const mysql = require('mysql');
const puppeteer = require('puppeteer');
const CONFIG = require('../config');
const DB = require('../db');
const cheerio = require('cheerio');
const tress = require('tress');

function pad(n) {
    return n < 10 ? '0' + n : n;
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms * 1000);
    });
}

class Category {
    constructor() {
        this.db = new DB();
        this.config = CONFIG;

        this.result_list = [];
        this.page_list = [];
        this.browse_list = [];

        this.max_worker_count = this.config.CATEGORY_MAX_WORK_COUNT;
        this.max_queue_count = this.max_worker_count * 5;
        this.db_category_list = [];
    }

    async createInstance(category_item) {
        const connection = this.connection;

        const page = this.page_list[category_item.id % this.max_worker_count];

        // await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36')
        const user_agent = this.config.USER_AGNETS;
        const agent_id = Math.floor(Math.random() * Math.floor(user_agent.length));
        await page.setUserAgent(user_agent[agent_id]);

        return {
            connection,
            page
        };
    }

    getDateTime() {
        const now = new Date();
        const date = now.getDate();
        const month = now.getMonth();
        const year = now.getFullYear();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const seconds = now.getSeconds();
        const result = `${year}-${pad(month + 1)}-${pad(date)} ${hour}:${minute}:${seconds}`;

        return result;
    }

    getSourceCode(url) {
        let domain = '';
        try {
            const reg = /\/\/(.*?)\//g;
            domain = reg.exec(url)[1].replace(/www\./g, '');
        } catch (error) { }
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

    async getProductLinks(connection, page, item) {
        console.log('~~~~~~~~GET PRODUCT LINKS~~~~~~~');
        console.log('DB Item Info = ', item.category_name, item.status);

        if (!item) return false;

        for (let pageNo = 0; pageNo < 2; pageNo++) {
            const url = `${item.category_url}?pg=${pageNo + 1}`;

            await page.goto(url);

            const result = await page.evaluate(async (item) => {
                const nodes = document.querySelectorAll("#zg-ordered-list .a-list-item > .a-section");
                const seller_links = [];
                const product_links = [];

                for (let i = 0; i < nodes.length; i++) {
                    const it = nodes[i];
                    const element = it.querySelector('span.zg-item > a');

                    if (element) {
                        const rank = parseInt(it.querySelector('.zg-badge-text').innerText.replace('#', ''));

                        let href_link = element.getAttribute('href');
                        const source_code = await getSourceCode(item.category_url);
                        const asin = await getAsin(href_link);
                        const browse_node = await getBrowseNode(item.category_url);
                        const title = element.innerText;
                        const img_node = element.querySelector('img');

                        let picture_url = '';
                        if (img_node) {
                            picture_url = img_node.getAttribute('src');
                        }
                        const price_node = it.querySelector("span.zg-item span[class*='sc-price']");
                        let price = null;
                        if (price_node) {
                            let reg = /[\d,.]+/g;
                            let price_text = price_node.innerText.trim();
                            let rePrice = price_text.match(reg);

                            if (Array.isArray(rePrice) && rePrice.length >= 1) {
                                price = rePrice[0];

                                if (source_code == 'amazon-com') {
                                    price = parseFloat(price.replace(/\,/g, ''));
                                } else {
                                    price = parseFloat(price.replace(/\,/g, '.'));
                                }
                            }
                        }

                        const reg = /\/\/(.*?)\//g;
                        const domain = reg.exec(item.category_url)[1];

                        if (!new RegExp(domain).test(href_link)) {
                            href_link = 'https://' + domain + href_link;
                        }

                        const d_time = await getDateTime();

                        seller_links.push({
                            'source_code': source_code,
                            'asin': asin,
                            'product_url': href_link,
                            'product_rank': rank,
                            'browse_node': browse_node,
                            'created_at': d_time,
                            'updated_at': d_time,
                        });

                        product_links.push({
                            'source_code': source_code,
                            'asin': asin,
                            'url': href_link,
                            'rank': rank,
                            'status': 'READY',
                            'title': title,
                            'price': price,
                            'picture_url': picture_url,
                            'browse_node': browse_node,
                            'created_at': d_time,
                            'updated_at': d_time,
                        });
                    }
                }

                return [seller_links, product_links];
            }, item);
            // console.log('item=', pageNo, item.category_name, result[1].length)
            try {
                const res = await this.db.insertRecords(connection, this.config.TABLE_NAME_PRODUCT, result[1]);
                if (res) {
                    await this.db.insertRecords(connection, this.config.TABLE_NAME_SELLER, result[0]);
                }
            } catch (e) {
                // console.log(e)
            }
        }
        return true;
    }


    // Scrape Product Detail
    async crawl(category_item) {
        const instance = await this.createInstance(category_item);
        const connection = instance.connection;
        const page = instance.page;

        console.log('+++++ start +++++', category_item.source_code, category_item.category_name, this.getDateTime());
        await sleep(this.config.CATEGORY_MAX_WAIT_TIME);
        console.log('+++++ wait +++++', category_item.source_code, category_item.category_name, this.getDateTime());
        // Get Product Detail
        const res = await this.getProductLinks(
            connection,
            page,
            category_item
        );
    }

    async initObject() {
        this.page_list = [];
        this.browse_list = [];

        const connection = mysql.createConnection({
            host: this.config.DB_HOST,
            user: this.config.DB_USER,
            password: this.config.DB_PASSWORD,
            database: this.config.DB_NAME
        });

        connection.connect();
        this.connection = connection;

        for (let i = 0; i < this.max_worker_count; i++) {
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
                width: 1200,
                height: 900
            });
            await page.setDefaultNavigationTimeout(120000);
            await page.exposeFunction('getSourceCode', this.getSourceCode);
            await page.exposeFunction('getDateTime', this.getDateTime);
            await page.exposeFunction('getBrowseNode', this.getBrowseNode);
            await page.exposeFunction('getAsin', this.getAsin);

            this.page_list.push(page);
            this.browse_list.push(browser);
        }

        this.db_category_list = await this.db.getRecords(this.connection, this.config.TABLE_NAME_CATEGORY, `status is null or status="${this.config.STATUS_READY}" or (status="${this.config.STATUS_RESERVED}" and reserved_at < NOW() - INTERVAL 15 MINUTE) or (status="${this.config.STATUS_FAILED}" and failed_at < NOW() - INTERVAL 30 MINUTE)`, ' order by id', this.max_queue_count);
        console.log("Get Categories = ", this.db_category_list.length);

        const arr = [];
        for (let i = 0; i < this.db_category_list.length; i++) {
            arr.push(this.db_category_list[i].id);
        }

        await this.db.updateStatus(this.connection, this.config.TABLE_NAME_CATEGORY, arr, this.config.STATUS_RESERVED);


        if (this.db_category_list == 0) {
            this.db_category_list = [];
            for (let i = 0; i < this.max_worker_count; i++) {
                this.page_list[i].close();
                this.browse_list[i].close();
            }

            this.connection.end();
        }
    }

    async start() {
        await this.initObject();
        const that = this;
        // const product = await this.crawl(db_category_list[0])

        // console.log(product);
        // that.connection.end();
        // return

        const q = tress((job, done) => {
            job.obj.crawl(job.db_item).then(function (res) {
                done(null, job.db_item);
            }, function (err) {
                console.log(err);
                done(true, job.db_item);
            });
        }, this.max_worker_count);

        const complete_process = () => {
            console.log('Finished');

            for (let i = 0; i < that.max_worker_count; i++) {
                try {
                    that.page_list[i].close().then(() => {
                        console.log('+++ browser close +++');
                        if (that.browse_list[i])
                            that.browse_list[i].close();
                    });
                } catch (error) {
                    console.log(error);
                }
            }

            console.log('****** close database connection ******', that.getDateTime());
            that.connection.end();

            setTimeout(() => {
                console.log('********* restart with new queue *********', that.getDateTime());
                that.initObject().then(function (params) {
                    for (let i = 0; i < that.db_category_list.length; i++) {
                        const db_item = that.db_category_list[i];

                        q.push({
                            obj: that,
                            db_item
                        });
                    }
                });
            }, that.config.CATEGORY_MAX_WAIT_TIME * 1000);
        };

        q.drain = () => {
            console.log('~~~~~~~~ drain ~~~~~~~~~', q.running(), that.getDateTime());
            complete_process();
        };

        q.retry = (item) => {
            console.log('********** retry ********** ', item.source_code, item.category_name, that.getDateTime());
            q.pause();
            that.db.updateStatus(that.connection, that.config.TABLE_NAME_CATEGORY, [item.id], that.config.STATUS_FAILED);
            setTimeout(function () {
                q.resume();
            }, 1000);
        };

        q.success = (item) => {
            console.log('~~~~~~~~ success ~~~~~~~~~', item.source_code, item.category_name, that.getDateTime());
            that.db.updateStatus(that.connection, that.config.TABLE_NAME_CATEGORY, [item.id], that.config.STATUS_FINISHED);
        };

        q.error = (item) => {
            console.log('~~~~~~~~ error ~~~~~~~~~', item, that.getDateTime());
        };

        q.empty = () => {
            console.log('~~~~~~~~ empty ~~~~~~~~~', q.running(), that.getDateTime());
            const workerList = q.workersList();
            for (let t = 0; t < workerList.length; t++) {
                console.log(workerList[t].data.db_item.category_name);
            }
        };

        for (let i = 0; i < this.db_category_list.length; i++) {
            const db_item = this.db_category_list[i];

            q.push({
                obj: this,
                db_item
            });
        }
    }
}

module.exports = Category;