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

class Product {
    constructor() {
        this.db = new DB();
        this.config = CONFIG;

        this.result_list = [];
        this.page_list = [];
        this.browse_list = [];

        // this.max_worker_count = 1
        this.max_worker_count = this.config.PRODUCT_MAX_WORK_COUNT;
        this.max_queue_count = this.max_worker_count * 5;
        this.db_product_list = [];
    }

    async createInstance(product_item) {
        const connection = this.connection;

        const page = this.page_list[product_item.id % this.max_worker_count];

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

        return `${year}-${pad(month + 1)}-${pad(date)} ${hour}:${minute}:${seconds}`;
    }

    getEan(cheerioSource) {
        let ean = '';
        cheerioSource('#detail-bullets li').each((i, el) => {
            const str = cheerioSource(el).text();
            if (/EAN/.test(str))
                ean = str.replace(/[\n\t\r#]/g, '').split(':').pop().trim();
        });

        return ean;
    }

    getUPC(cheerioSource) {
        let upc = '';
        cheerioSource('#detail-bullets li').each((i, el) => {
            const str = cheerioSource(el).text();
            if (/UPC/.test(str))
                upc = str.replace(/[\n\t\r#]/g, '').split(':').pop().trim();
        });

        return upc;
    }

    getTitle(cheerioSource) {
        let title = cheerioSource('#productTitle').text()
            .trim();

        if (!title) {
            var metaTitle = cheerioSource('meta[name=title]').text();
            if (metaTitle) {
                title = metaTitle.split(':')[0];
            }
        }

        return title;
    }

    getBrand(cheerioSource) {
        let brand = cheerioSource('#mbc').data('brand');

        if (!brand) {
            brand = cheerioSource('#bylineInfo').text();
        }

        return brand;
    }

    getPictureUrl(cheerioSource) {
        let picture_url = cheerioSource('#imgTagWrapperId img').data('old-hires');
        if (!picture_url) {
            var dynamicImage = cheerioSource('#imgTagWrapperId img').data('a-dynamic-image');
            if (dynamicImage) {
                for (var property in dynamicImage) {
                    if (property.indexOf('_SX') < 0) {
                        picture_url = property;
                        break;
                    }
                }
            }
        }

        return picture_url;
    }

    getScore(cheerioSource) {
        const score = cheerioSource('#averageCustomerReviews .a-icon-star span').text().trim();
        const reg = /[\d,.]+/g;
        const reScore = score.match(reg);
        if (Array.isArray(reScore) && reScore.length >= 1) {
            return parseFloat(reScore[0]);
        }

        return null;
    }

    getReviewsCount(cheerioSource) {
        const review_text = cheerioSource('#acrCustomerReviewText').text().trim();
        const reg = /[\d,.]+/g;
        const reReview = review_text.match(reg);
        if (Array.isArray(reReview) && reReview.length >= 1) {
            return parseInt(reReview[0].replace(/\,/g, ''));
        }

        return 0;
    }

    getPrice(cheerioSource, source_code) {
        let price;
        let reg = /[\d,.]+/g;
        let price_text = cheerioSource('#priceblock_snsprice_Based span').text().trim();
        let rePrice = price_text.match(reg);

        if (Array.isArray(rePrice) && rePrice.length >= 1) {
            price = rePrice[0];
        } else {
            price_text = cheerioSource('span#priceblock_ourprice').text().trim();
            rePrice = price_text.match(reg);

            if (Array.isArray(rePrice) && rePrice.length >= 1) {
                price = rePrice[0];
            } else {
                price_text = cheerioSource('span#priceblock_dealprice').text().trim(); // ASIN: B015Z7XE0A
                rePrice = price_text.match(reg);

                if (Array.isArray(rePrice) && rePrice.length >= 1) {
                    price = rePrice[0];
                } else {
                    price_text = cheerioSource('span#priceblock_saleprice').text().trim(); // ASIN: B016Q6L7WQ
                    rePrice = price_text.match(reg);

                    if (Array.isArray(rePrice) && rePrice.length >= 1) {
                        price = rePrice[0];
                    } else {
                        price_text = cheerioSource('#unqualifiedBuyBox .a-color-price').text().trim(); // ASIN: B00PQSVJLK
                        rePrice = price_text.match(reg);

                        if (Array.isArray(rePrice) && rePrice.length >= 1) {
                            price = rePrice[0];
                        } else {
                            price_text = cheerioSource('div.sims-fbt-total-price span[class*="a-color-price"] span').text().trim(); // ASIN: B07CF8PY4Q
                            rePrice = price_text.match(reg);

                            if (Array.isArray(rePrice) && rePrice.length >= 1) {
                                price = rePrice[0];
                            }
                        }
                    }
                }
            }
        }
        try {
            if (source_code == 'amazon-com') {
                price = parseFloat(price.replace(/\,/g, ''));
            } else {
                price = parseFloat(price.replace(/\,/g, '.'));
            }
        } catch (error) {
            console.log('++++ price not found ++++');
            price = 0;
        }

        return price;
    }

    async getProductDetail(page, product_db_item) {
        if (!product_db_item) return null;

        const url = product_db_item.url;
        // const url = "https://www.amazon.com/dp/B07CF8PY4Q"
        // console.log(product_db_item.source_code, product_db_item.asin)
        await page.goto(url);
        let content = await page.content();
        var $ = cheerio.load(content);

        if (
            /While we were trying to do your input, a technical error occurred./.test(content) ||
            /Während wir Ihre Eingabe ausführen wollten, ist ein technischer Fehler aufgetreten/.test(content)) {
            console.log('____ TECHINICAL ERROR MESSAGE FOUND ____');
            return null;
        }

        if (/Bot Check/.test($('title').text())) {
            console.log('____ CAPTCHA FOUND ____');
            return null;
        }
        const product_item = {};
        product_item.id = product_db_item.id;
        product_item.source_code = product_db_item.source_code;
        product_item.asin = product_db_item.asin;
        product_item.ean = this.getEan($);
        product_item.upc = this.getUPC($);
        product_item.rank = product_db_item.rank;
        product_item.browse_node = product_db_item.browse_node;
        product_item.title = this.getTitle($);
        product_item.brand = this.getBrand($);
        product_item.url = url;
        product_item.picture_url = this.getPictureUrl($);
        product_item.score = this.getScore($);
        product_item.reviews_count = this.getReviewsCount($);
        product_item.price = this.getPrice($, product_db_item.source_code);

        const d_time = this.getDateTime();

        product_item.created_at = product_db_item.created_at;
        product_item.updated_at = d_time;

        return product_item;
    }

    async saveProducts(connection, is_last = false) {
        if ((this.result_list.length > this.config.MAX_DB_INSERT_COUNT) || is_last) {
            // console.log(JSON.stringify(this.result_list, null, '\t'));
            if (this.result_list.length > 0) {
                const insert_result = await this.db.insertRecords(connection, this.config.TABLE_NAME_PRODUCT, this.result_list);

                if (insert_result) {
                    const arr = [];

                    for (let t = 0; t < this.result_list.length; t++) {
                        arr.push(this.result_list[t].id);
                    }

                    await this.db.updateStatus(this.connection, this.config.TABLE_NAME_PRODUCT, arr, this.config.STATUS_FINISHED);
                }
                this.result_list = [];
            }
        }
    }

    // Scrape Product Detail
    async crawl(product_item) {
        const instance = await this.createInstance(product_item);
        const connection = instance.connection;
        const page = instance.page;

        console.log('+++++ start +++++', product_item.source_code, product_item.asin, this.getDateTime());
        await sleep(this.config.PRODUCT_MAX_WAIT_TIME);
        console.log('+++++ wait +++++', product_item.source_code, product_item.asin, this.getDateTime());
        // Get Product Detail
        const product = await this.getProductDetail(
            page,
            product_item
        );

        if (!product) {
            throw ('Error');
        }

        this.result_list.push(product);
        await this.saveProducts(connection);
        return product;
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
                ],
                timeout: 60000
            });
            const page = await browser.newPage();
            // await page.authenticate({
            //     username: this.config.PROXY_USER,
            //     password: this.config.PROXY_PASS,
            // });
            await page.setViewport({
                width: 800,
                height: 600
            });
            await page.setDefaultNavigationTimeout(600000);
            this.page_list.push(page);
            this.browse_list.push(browser);
        }

        this.db_product_list = await this.db.getRecords(this.connection, this.config.TABLE_NAME_PRODUCT, `status="${this.config.STATUS_READY}" or (status="${this.config.STATUS_RESERVED}" and reserved_at < NOW() - INTERVAL 15 MINUTE) or (status="${this.config.STATUS_FAILED}" and failed_at < NOW() - INTERVAL 30 MINUTE)`, ' order by id', this.max_queue_count);
        console.log("Get Products = ", this.db_product_list.length);

        const arr = [];
        for (let i = 0; i < this.db_product_list.length; i++) {
            arr.push(this.db_product_list[i].id);
        }

        if (this.db_product_list.length !== 0)
            await this.db.updateStatus(this.connection, this.config.TABLE_NAME_PRODUCT, arr, this.config.STATUS_RESERVED);

        if (this.db_product_list == 0) {
            this.db_product_list = [];

            for (let i = 0; i < this.max_worker_count; i++) {
                try {
                    this.page_list[i].close().then(() => {
                        console.log('+++ browser close +++');
                        if (this.browse_list[i])
                            this.browse_list[i].close();
                    });
                } catch (error) {
                    console.log(error);
                }
            }

            this.connection.end();
        }
    }

    async start() {
        await this.initObject();
        const that = this;
        // const product = await this.crawl(db_product_list[0])

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
                that.page_list[i].close().then(() => {
                    console.log('+++ browser close +++');
                    if (that.browse_list[i])
                        that.browse_list[i].close();
                });
            }
            console.log('SAVE', that.result_list.length);
            that.saveProducts(that.connection, true).then(() => {
                console.log('****** close database connection ******', that.getDateTime());
                that.connection.end();

                setTimeout(() => {
                    console.log('********* restart with new queue *********', that.getDateTime());
                    that.initObject().then(function (params) {
                        for (let i = 0; i < that.db_product_list.length; i++) {
                            const db_item = that.db_product_list[i];

                            q.push({
                                obj: that,
                                db_item
                            });
                        }
                    });
                }, that.config.PRODUCT_MAX_WAIT_TIME * 1000);
            });
        };
        q.drain = () => {
            console.log('~~~~~~~~ drain ~~~~~~~~~', q.running(), that.getDateTime());
            complete_process();
        };

        q.retry = (item) => {
            console.log('********** retry ********** ', item.source_code, item.asin, that.getDateTime());
            that.db.updateStatus(that.connection, that.config.TABLE_NAME_PRODUCT, [item.id], that.config.STATUS_FAILED);
        };

        q.success = (item) => {
            console.log('~~~~~~~~ success ~~~~~~~~~', item.source_code, item.asin, that.getDateTime());
            // that.db.updateStatus(that.connection, that.config.TABLE_NAME_PRODUCT, [item.id], that.config.STATUS_FINISHED)
        };

        q.error = (item) => {
            console.log('~~~~~~~~ error ~~~~~~~~~', item, that.getDateTime());
        };

        q.empty = () => {
            console.log('~~~~~~~~ empty ~~~~~~~~~', q.running(), that.getDateTime());
            // const workerList = q.workersList();

            // for (let t = 0; t < workerList.length; t++) {
            //     console.log(workerList[t].data.db_item.asin);
            // }
        };


        for (let i = 0; i < this.db_product_list.length; i++) {
            const db_item = this.db_product_list[i];

            q.push({
                obj: this,
                db_item
            });
        }
    }
}

module.exports = Product;