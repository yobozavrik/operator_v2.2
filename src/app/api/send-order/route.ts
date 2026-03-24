import { NextResponse } from 'next/server';
import { OrderItem } from '@/types/order';
import { formatOrderMessageHTML } from '@/lib/messageFormatter';
import { requireAuth } from '@/lib/auth-guard';

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const { items, platform } = await request.json();

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Invalid order items' },
                { status: 400 }
            );
        }

        const orderItems = items as OrderItem[];
        const message = formatOrderMessageHTML(orderItems);

        switch (platform) {
            case 'telegram':
                return await sendToTelegram(message);

            case 'viber':
                // TODO: Implement Viber API
                return NextResponse.json({
                    success: true,
                    message: 'Viber integration coming soon'
                });

            case 'whatsapp':
                // TODO: Implement WhatsApp API
                return NextResponse.json({
                    success: true,
                    message: 'WhatsApp integration coming soon'
                });

            case 'download':
                // Return formatted text for download
                return NextResponse.json({
                    success: true,
                    data: message
                });

            default:
                return NextResponse.json(
                    { error: 'Invalid platform' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Send order error:', error);
        return NextResponse.json(
            { error: 'Failed to send order' },
            { status: 500 }
        );
    }
}

async function sendToTelegram(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn('Telegram credentials not configured');
        return NextResponse.json({
            success: false,
            error: 'Telegram not configured. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local'
        });
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Telegram API error:', data);
            return NextResponse.json({
                success: false,
                error: data.description || 'Failed to send to Telegram'
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Order sent to Telegram successfully'
        });
    } catch (error) {
        console.error('Telegram send error:', error);
        return NextResponse.json({
            success: false,
            error: 'Network error while sending to Telegram'
        });
    }
}
