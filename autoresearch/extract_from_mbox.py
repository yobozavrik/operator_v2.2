"""
extract_from_mbox.py — Витягує xlsx вкладення з Gmail Takeout MBOX
====================================================================
Після того як Google Takeout надішле архів:
1. Розпакуй zip архів
2. Знайди файл .mbox (зазвичай: Takeout/Mail/All mail Including Spam and Trash.mbox)
3. Запусти: python extract_from_mbox.py "шлях/до/файлу.mbox"
"""

import mailbox
import email
import email.header
import os
import sys
from pathlib import Path
from datetime import datetime

SENDER_FILTER = "pizza.galabaluvana.bukovina@gmail.com"
OUTPUT_DIR    = Path("D:/operator-main/autoresearch/balance_exports")
OUTPUT_DIR.mkdir(exist_ok=True)

def decode_str(s):
    if s is None:
        return ""
    parts = email.header.decode_header(s)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)

def main(mbox_path: str):
    print(f"Читаємо MBOX: {mbox_path}")
    mbox = mailbox.mbox(mbox_path)

    total     = 0
    matched   = 0
    downloaded = 0
    skipped   = 0

    for msg in mbox:
        total += 1
        sender = decode_str(msg.get("From", ""))
        if SENDER_FILTER.lower() not in sender.lower():
            continue
        matched += 1

        # Дата листа
        date_str = msg.get("Date", "")
        try:
            msg_date = email.utils.parsedate_to_datetime(date_str)
            date_label = msg_date.strftime("%Y%m%d")
        except Exception:
            date_label = "unknown"

        # Шукаємо xlsx вкладення
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get("Content-Disposition") is None:
                continue

            filename = part.get_filename()
            if not filename:
                continue

            filename = decode_str(filename)
            if not filename.lower().endswith(".xlsx"):
                continue

            out_name = f"{date_label}_{filename}"
            out_path = OUTPUT_DIR / out_name

            if out_path.exists():
                skipped += 1
                continue

            payload = part.get_payload(decode=True)
            if payload:
                out_path.write_bytes(payload)
                downloaded += 1
                print(f"  [{date_label}] {filename}")

    print(f"\nВсього листів: {total}")
    print(f"Від {SENDER_FILTER}: {matched}")
    print(f"Завантажено xlsx: {downloaded}, пропущено (вже є): {skipped}")
    print(f"Файли збережено в: {OUTPUT_DIR}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Використання: python extract_from_mbox.py <шлях_до_.mbox>")
        print('Приклад: python extract_from_mbox.py "C:/Users/dmytr/Downloads/Takeout/Mail/All mail.mbox"')
        sys.exit(1)
    main(sys.argv[1])
