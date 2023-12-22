import {exec} from "child_process";
import {createHash} from "crypto";

const WIFI_IP = "192.168.1.254";
const WIFI_NAME = "ssid-goes-here";
const WIFI_ADMIN = "admin-password-goes-here";

const DISCORD_WEBHOOK = "discord webhook url goes here";

// async wrapper for exec
const $ = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                reject(err)
            }
            console.log(`> ${stdout.trim()}`);
            resolve(stdout ? stdout : stderr)
        })
    });
}

// connect to the wifi and check connection
const connect = async () => {
    console.log(`Connecting to ${WIFI_NAME}`);
    await $(`netsh wlan connect name=${WIFI_NAME} ssid=${WIFI_NAME}`);

    console.log(`Giving it a few seconds to establish the connection`);
    await pause(10);

    console.log(`\nChecking connection`);
    return await checkConnection();
}

// check connection by sending a message to discord
const checkConnection = async () => {
    try {
        await fetch(DISCORD_WEBHOOK, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                content: `I'm online! The time is ${new Date().toLocaleString()}.`
            })
        });
        console.log(`> We're online!`);

        return true;
    } catch (e) {
        console.log(`> Connection failed, ${e}`);
        return false;
    }
}

// pause for a number of seconds
const pause = (secs) => {
    return new Promise(r => setTimeout(r, secs * 1000));
}

class AdminAPI {

    constructor() {
        this.urn = this.randomString(16);
    }

    // attempt to log in
    // a better version would actually validate the result but i'm too lazy
    async login(password) {
        const hash = createHash("md5");
        hash.update(password);
        const pwd = hash.digest("hex").toLowerCase();

        await fetch(`http://${WIFI_IP}/login.cgi`, {
            method: "POST",
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`,
                "Content-Type": "text/plain;charset=UTF-8"
            },
            body: `GO=broadband.htm&usr=admin&pws=${pwd}`,
            redirect: "manual"
        });

        console.log(` > We're probably logged in now`);
    }

    // send the reboot command
    async reboot() {
        const pageRes = await fetch(`http://${WIFI_IP}/restart.htm`, {
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`
            }
        });

        const pageText = await pageRes.text();
        const pi = pageText.match(/<meta name="pi" content="(.*)">/)[1];

        const cgiRes = await fetch(`http://${WIFI_IP}/cgi/cgi_Restart.js?t=${Date.now()}`, {
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`
            }
        });

        const cgiText = await cgiRes.text();
        const cgi = cgiText.match(/,(.*),/)[1];

        fetch(`http://${WIFI_IP}/apply.cgi`, {
            method: "POST",
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`,
                "Content-Type": "text/plain"
            },
            body: `CMD=&GO=basic_-_restart.htm&SET0=${cgi}%3DREBOOT&pi=${pi}`
        }).catch(() => 0);

        console.log(" > Reboot command sent!");
    }

    // send the factory reset command
    async reset() {
        const pageRes = await fetch(`http://${WIFI_IP}/system.htm`, {
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`
            }
        });

        const pageText = await pageRes.text();
        const pi = pageText.match(/<meta name="pi" content="(.*)">/)[1];

        const cgiRes = await fetch(`http://${WIFI_IP}/cgi/cgi_system.js?t=${Date.now()}`, {
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`
            }
        });

        const cgiText = await cgiRes.text();
        const cgi = cgiText.match(/,(.*),/)[1];

        fetch(`http://${WIFI_IP}/apply.cgi`, {
            method: "POST",
            headers: {
                "Cookie": `urn=${this.urn}; logout=not`,
                "Content-Type": "text/plain"
            },
            body: `CMD=&GO=system.htm&SET0=${cgi}%3DRESTORE&pi=${pi}`
        }).catch(() => 0);

        console.log(" > Reset command sent!");
    }

    // this is pulled directly from the source
    // and is exactly how session tokens are generated
    // how secure!
    randomString(length) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'.split('');

        if (!length) {
            length = Math.floor(Math.random() * chars.length);
        }

        let str = '';
        for (let i = 0; i < length; i++) {
            str += chars[Math.floor(Math.random() * chars.length)];
        }
        return str;
    }
}


(async () => {
    if (await connect()) return;

    await pause(10);

    console.log(`\nAttempting a reboot`);
    let api = new AdminAPI();
    await api.login(WIFI_ADMIN);
    await api.reboot();

    console.log(`\nWaiting a few minutes for the reboot to process`)
    await pause(300);

    if (await connect()) return;

    console.log(`\nAttempting a factory reset`)
    api = new AdminAPI();
    await api.login(WIFI_ADMIN);
    await api.reset();

    console.log(`\nWaiting a few minutes for the reset to process`)
    await pause(300);

    if (await connect()) return;

    console.log("Still no joy! Who would have thought...");
})();