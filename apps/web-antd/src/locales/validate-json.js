import fs from 'fs';
import path from 'path';

const files = [
    '/Users/zhaoxiaojie/Downloads/main/Quality-Guardian/apps/web-antd/src/locales/langs/zh-CN/qms.json',
    '/Users/zhaoxiaojie/Downloads/main/Quality-Guardian/apps/web-antd/src/locales/langs/zh-CN/common.json'
];

files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        JSON.parse(content);
        console.log(`PASS: ${path.basename(file)} is valid JSON.`);
    } catch (e) {
        console.error(`FAIL: ${path.basename(file)} is INVALID JSON.`);
        console.error(e.message);
    }
});
