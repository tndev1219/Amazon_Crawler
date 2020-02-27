const os = require('os');
const Category = require('./scrape/category');
const Product = require('./scrape/product');
const CONFIG = require('./config');

if (process.argv.length !== 3)
    throw new Error('Invalid argument: <TYPE> ( "category": category scraping mode, "product" -> product detail scraping mode)');

const type = process.argv[2];
if ((type !== CONFIG.MODE_CATEGORY) && (type != CONFIG.MODE_PRODUCT)) {
    throw new Error(`Invalid type argument value`);
}

if (type == CONFIG.MODE_CATEGORY) {
    const category = new Category();
    category.start();
} else if (type == CONFIG.MODE_PRODUCT) {
    const product = new Product();
    product.start();
}