import fs from 'fs';

function extractSql(filePath) {
    const c = fs.readFileSync(filePath, 'utf8');
    const match = c.match(/"definition": "(CREATE OR REPLACE [\\s\\S]+?\\$function\\$\\n)"/);
    if (match && match[1]) {
        return match[1].replace(/\\n/g, '\\n');
    }
    return '';
}

let f2 = extractSql('C:/Users/user/.gemini/antigravity/brain/833d79cc-b01b-45e8-9599-343f7dbb4bfc/.system_generated/steps/381/output.txt').replace(/\\\\n/g, '\\n');
let f3 = extractSql('C:/Users/user/.gemini/antigravity/brain/833d79cc-b01b-45e8-9599-343f7dbb4bfc/.system_generated/steps/382/output.txt').replace(/\\\\n/g, '\\n');
let fplan = extractSql('C:/Users/user/.gemini/antigravity/brain/833d79cc-b01b-45e8-9599-343f7dbb4bfc/.system_generated/steps/392/output.txt').replace(/\\\\n/g, '\\n');

let sql3 = f2.replace(/graviton\\./g, 'sadova1.') + "\\n" + f3.replace(/graviton\\./g, 'sadova1.') + "\\n" + fplan.replace(/graviton\\./g, 'sadova1.');

fs.appendFileSync('c:/Users/user/Downloads/operator_v2.2-clone/supabase/migrations/20260403_sadova_views_1_basic.sql', "\\n-- Functions:\\n" + sql3);
