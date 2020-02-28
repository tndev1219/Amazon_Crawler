const os = require('os');
const InitCategory = require('./scrape/old_category');
const Category = require('./scrape/category');
const Product = require('./scrape/product');
const CONFIG = require('./config');

if (process.argv.length !== 3)
    throw new Error('Invalid argument: <TYPE> ( "category": category scraping mode, "product" -> product detail scraping mode)');

const type = process.argv[2];
if ((type !== CONFIG.MODE_CATEGORY) && (type != CONFIG.MODE_PRODUCT) && (type != CONFIG.MODE_INIT)) {
    throw new Error(`Invalid type argument value`);
}

if (type == CONFIG.MODE_CATEGORY) {
    const category = new Category();
    category.start();
} else if (type == CONFIG.MODE_PRODUCT) {
    const product = new Product();
    product.start();
} else if (type == CONFIG.MODE_INIT) {
    const product = new InitCategory();
    product.start();
}