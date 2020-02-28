const mysql = require('mysql');
const puppeteer = require('puppeteer');
const CONFIG = require('../config');
const DB = require('../db');

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms * 1000);
    });
}

class Category {
    constructor() {
        this.db = new DB();
        this.config = CONFIG;
        this.start_urls = [
            'https://www.amazon.com/Best-Sellers/zgbs/',
            'https://www.amazon.it/gp/bestsellers/',
            'https://www.amazon.es/bestsellers',
            'https://www.amazon.fr/bestsellers',
            'https://www.amazon.de/bestsellers',
        ];
    }

    async createInstance() {
        const connection = mysql.createConnection({
            host: this.config.DB_HOST,
            user: this.config.DB_USER,
            password: this.config.DB_PASSWORD,
            database: this.config.DB_NAME,
        });

        await connection.connect();

        const browser = await puppeteer.launch({
            'headless': false,
            args: [
                '--child-clean-exit',
                '--wait-for-children-before-exiting',
                '--disable-dev-profile',
                '--disable-web-security',
                '--ignore-certificate-errors',
                '--disable-setuid-sandbox',
                `--proxy-server=${this.config.PROXY}`
            ]
        });
        const page = await browser.newPage();
        await page.authenticate({
            username: this.config.PROXY_USER,
            password: this.config.PROXY_PASS,
        });
        await page.setViewport({
            width: 800,
            height: 600
        });
        await page.setDefaultNavigationTimeout(120000);
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36');

        return {
            connection,
            browser,
            page
        };
    }

    getDateTime() {
        function pad(n) {
            return n < 10 ? '0' + n : n;
        }

        const now = new Date();
        const date = now.getDate();
        const month = now.getMonth();
        const year = now.getFullYear();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const seconds = now.getSeconds();

        return `${year}-${pad(month + 1)}-${pad(date)} ${hour}:${minute}:${seconds}`;
    }

    getSourceCode(url) {
        const reg = /\/\/(.*?)\//g;
        const domain = reg.exec(url)[1].replace(/www\./g, '');
        return domain.replace(/\./g, '-');
    }

    getBrowseNode(url) {
        const reg = /(.*?)\/ref/g;
        const reBrowseNode = reg.exec(url);
        if (reBrowseNode) {
            return reBrowseNode[1].split('/').pop();
        }

        return '';
    }

    getAsin(url) {
        const reg = /dp\/(.*?)\//g;
        const reAsin = reg.exec(url);

        if (reAsin) {
            return reAsin[1];
        }
        return '';
    }

    async getRootCategoryLink(connection, page, item, level = 1) {
        console.log('~~~~~~~~~~~~~~~');
        console.log(item);

        if (!item) return [];

        const db_category_list = await this.db.getRecords(connection, this.config.TABLE_NAME_CATEGORY);
        let found_item = db_category_list.find(db_item =>
            db_item.category_name == item.category_name &&
            db_item.category_level == item.category_level &&
            db_item.category_status == this.config.CATEGORY_SCRAPED);

        if (found_item) {
            // console.log('///////////////////');
            // console.log(found_item);
            return [];
        }

        await page.goto(item.category_url);

        const category_links = await page.evaluate(async (level) => {
            let nodes = null;
            if (level == 1) {
                nodes = document.querySelectorAll("ul#zg_browseRoot ul li a");
            } else {
                const selected_item = document.querySelector("ul#zg_browseRoot ul li span.zg_selected");

                if (selected_item) {
                    if (!selected_item.parentElement.nextElementSibling || selected_item.parentElement.nextElementSibling.tagName.toLowerCase() != 'ul')
                        return null;

                    nodes = selected_item.parentElement.nextElementSibling.querySelectorAll("li a");
                }
            }
            const d_time = await getDateTime();

            const links = [];

            // for test, must delete this part
            var loopcount = 0;
            if (nodes.length > 2) {
                loopcount = 2;
            } else {
                loopcount = nodes.length;
            }

            for (let i = 0; i < loopcount; i++) {
                const item = nodes[i];
                const href_link = item.getAttribute('href');
                const href_text = item.innerText;
                if (/amazon\./.test(href_link)) {
                    links.push({
                        'browse_node': await getBrowseNode(href_link),
                        'source_code': await getSourceCode(href_link),
                        'category_name': href_text,
                        'category_url': href_link,
                        'category_level': level,
                        'category_status': 0,
                        'created_at': d_time,
                        'updated_at': d_time,
                    });
                }
            }
            return links;
        }, level);

        if (category_links) {
            const arr = [];
            for (let c_item of category_links) {
                arr.push(c_item.category_name);
            }

            let isBool = true;
            let db_category_list = await this.db.getRecords(connection, this.config.TABLE_NAME_CATEGORY);

            const reg = /\/\/(.*?)\//g;
            const domain = reg.exec(item.category_url)[1];
            // console.log('+++++', domain);
            // console.log(db_category_list.length)
            db_category_list = db_category_list.filter(db_item =>
                new RegExp(domain).test(db_item.category_url) &&
                db_item.category_level == level &&
                arr.includes(db_item.category_name)
            );
            // console.log('************', db_category_list.length, category_links.length)

            if ((db_category_list.length == 0) || (db_category_list.length != category_links.length))
                isBool = false;

            for (let c_item of category_links) {
                found_item = db_category_list.find(db_item =>
                    db_item.category_name == c_item.category_name &&
                    db_item.category_level == c_item.category_level &&
                    db_item.category_status == 0);

                if (found_item)
                    isBool = false;
            }

            if (isBool == true) { // all sub categoreis are scraped before
                // console.log('******* all sub is done *********')
                return null;
            } else {
                await this.db.insertRecords(connection, this.config.TABLE_NAME_CATEGORY, category_links);
            }
        }
        return category_links;
    }

    async getProductLinks(connection, page, item) {
        console.log('~~~~~~~~GET PRODUCT LINKS~~~~~~~');
        console.log(item);

        if (!item) return [];

        for (let i = 0; i < 2; i++) {
            const url = `${item.category_url}?pg=${i + 1}`;

            await page.goto(url);
            const result = await page.evaluate(async (item) => {
                const nodes = document.querySelectorAll("#zg-ordered-list .a-list-item > .a-section");
                const seller_links = [];
                const product_links = [];

                for (let i = 0; i < nodes.length; i++) {
                    const it = nodes[i];
                    const element = it.querySelector('span.zg-item > a');

                    if (element) {
                        const rank = it.querySelector('.zg-badge-text').innerText;

                        let href_link = element.getAttribute('href');

                        const reg = /\/\/(.*?)\//g;
                        const domain = reg.exec(item.category_url)[1];

                        if (!new RegExp(domain).test(href_link)) {
                            href_link = 'https://' + domain + href_link;
                        }

                        const d_time = await getDateTime();

                        seller_links.push({
                            'source_code': await getSourceCode(href_link),
                            'asin': await getAsin(href_link),
                            'product_url': href_link,
                            'product_rank': parseInt(rank.replace('#', '')),
                            'browse_node': await getBrowseNode(item.category_url),
                            'created_at': d_time,
                            'updated_at': d_time,
                        });

                        product_links.push({
                            'source_code': await getSourceCode(href_link),
                            'asin': await getAsin(href_link),
                            'url': href_link,
                            'rank': parseInt(rank.replace('#', '')),
                            'browse_node': await getBrowseNode(item.category_url),
                            'created_at': d_time,
                            'updated_at': d_time,
                        });
                    }
                }

                return [seller_links, product_links];
            }, item);

            try {
                const res = await this.db.insertRecords(connection, this.config.TABLE_NAME_PRODUCT, result[1]);
                if (res)
                    await this.db.insertRecords(connection, this.config.TABLE_NAME_SELLER, result[0]);
            } catch (e) { }
        }
    }

    // Scrape Category and get product urls
    crawl(url) {
        return new Promise(async (resolve) => {
            const instance = await this.createInstance();
            const connection = instance.connection;
            const page = instance.page;
            const browser = instance.browser;

            try {
                await page.exposeFunction('getSourceCode', this.getSourceCode);
                await page.exposeFunction('getDateTime', this.getDateTime);
                await page.exposeFunction('getBrowseNode', this.getBrowseNode);
                await page.exposeFunction('getAsin', this.getAsin);

                let level = 1;
                let arr = [];
                // Root Level Category Get
                let c_links = await this.getRootCategoryLink(
                    connection,
                    page,
                    {
                        'category_url': url,
                        'category_level': 0,
                    },
                    level
                );
                // Loop until deepest level is founded
                while (true) {
                    level += 1;
                    arr = [];
                    for (let item of c_links) {
                        await sleep(this.config.WAIT_TIME);

                        const links = await this.getRootCategoryLink(
                            connection,
                            page,
                            item,
                            level
                        );
                        // console.log('************', item.category_url, '***** level ***** ',item.category_level, '**** count ***', links ? links.length : null);
                        if (links == null) {
                            console.log('XXXXXXXXXX UPDATE XXXXXXXXX');
                            console.log(item);
                            await this.db.updateCategory(connection, item.category_name, level - 1);
                            resolve(true);
                        } else {
                            for (let link of links) {
                                await this.getProductLinks(connection, page, link);
                                arr.push(link);
                            }
                        }
                    }
                    // console.log('+++++ FOUND ITEM ++++++++', arr.length)
                    c_links = arr;

                    if (c_links.length == 0)
                        break;
                }
            } catch (error) {
                console.log(error);
            }

            await browser.close();
            await connection.end();
            resolve(true);
        });
    }

    start() {
        const actions = [];
        for (let url of this.start_urls) {
            actions.push(this.crawl(url));
        }
        Promise.all(actions);
    }
}

module.exports = Category;