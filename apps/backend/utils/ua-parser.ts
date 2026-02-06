export interface UAInfo {
    browser: string;
    os: string;
    device: string;
}

export function parseUA(ua: string | undefined): UAInfo {
    if (!ua) {
        return {
            browser: 'Unknown',
            os: 'Unknown',
            device: '桌面设备',
        };
    }

    let browser = 'Unknown';
    let os = 'Unknown';
    let device = '桌面设备';

    // Parse OS
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'Mac OS X';
    else if (/linux/i.test(ua)) os = 'Linux';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/android/i.test(ua)) os = 'Android';

    // Parse Browser
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome/i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/trident/i.test(ua)) browser = 'IE';
    else if (/qqbrowser/i.test(ua)) browser = 'QQ Browser';

    // Parse Device Type
    if (/mobile|android|iphone|ipod/i.test(ua)) device = '移动设备';
    else if (/ipad|tablet/i.test(ua)) device = '平板设备';

    return { browser, os, device };
}
