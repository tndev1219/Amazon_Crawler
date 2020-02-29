const mysql = require('mysql');
const CONFIG = require('./config');

function pad(n) {
    return n < 10 ? '0' + n : n;
}

function getDateTime() {
    const now = new Date();
    const date = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const seconds = now.getSeconds();

    return `${year}-${pad(month + 1)}-${pad(date)} ${hour}:${minute}:${seconds}`;
}

class DB {
    constructor() {

    }

    updateCategory(connection, category_name, category_level) {
        return new Promise(function (resolve, reject) {
            const query = `UPDATE  amazon_category SET category_level = '${category_level}' WHERE category_name = '${category_name}'`;
            connection.query(query, function (error, results, fields) {
                if (error) reject(error);

                resolve(results);
            });
        });
    }

    updateStatus(connection, table_name, ids, status) {
        let date_update = '';
        if (status == CONFIG.STATUS_RESERVED) {
            date_update = `reserved_at='${getDateTime()}'`;
        } else if (status == CONFIG.STATUS_FAILED) {
            date_update = `failed_at='${getDateTime()}'`;
        } else if (status == CONFIG.STATUS_FINISHED) {
            date_update = `finished_at='${getDateTime()}'`;
        }

        return new Promise(function (resolve, reject) {
            const query = `UPDATE  ${table_name} SET status = '${status}', ${date_update} WHERE id in (${ids})`;
            connection.query(query, function (error, results, fields) {
                if (error) reject(error);

                resolve(results);
            });
        });
    }

    insertRecords(connection, table_name, rows) {
        const res = new Promise(function (resolve, reject) {
            if (rows.length == 0)
                resolve(true);

            const values = [];
            const key_list = [];

            Object.keys(rows[0]).forEach(key => {
                key_list.push(key);
            });

            let arr = [];
            rows.forEach(item => {
                let t_arr = [];
                key_list.forEach(key => {
                    t_arr.push('?');
                    values.push(item[key]);
                });

                arr.push(`( ${t_arr.join(',')})`);
            });

            let values_str = arr.join(",");

            arr = [];
            key_list.forEach(key => {
                if (key == 'category_status') {
                    arr.push(`category_status=IF(category_status=0, values(category_status), category_status)`);
                } else if (
                    (key == 'title') && (table_name == CONFIG.TABLE_NAME_PRODUCT) ||
                    (key == 'picture_url') && (table_name == CONFIG.TABLE_NAME_PRODUCT) ||
                    (key == 'url') && (table_name == CONFIG.TABLE_NAME_PRODUCT) ||
                    (key == 'asin') && (table_name == CONFIG.TABLE_NAME_PRODUCT)
                ) {
                    arr.push(`${key}=IF(${key} is null or ${key} = '', values(${key}), ${key})`);
                } else if (
                    (key == 'price') && (table_name == CONFIG.TABLE_NAME_PRODUCT)
                ) {
                    arr.push(`${key}=IF(${key} is null or ${key} = 0, values(${key}), ${key})`);
                } else if (key == 'created_at') {
                    arr.push(`created_at=IF(isnull(created_at), values(created_at), created_at)`);
                } else {
                    arr.push(`${key}=VALUES(${key})`);
                }
            });

            let update_value_str = arr.join(",");

            let insertQuery = `INSERT INTO ${table_name} (${key_list}) VALUES ${values_str} ON DUPLICATE KEY UPDATE ${update_value_str}`;
            let query = mysql.format(insertQuery, values);
            connection.query(query, (err, response) => {
                if (err) {
                    resolve(false);
                }

                resolve(true);
            });
        });

        return res;
    }

    getRecords(connection, table_name, where = "1", orderBy = ' order by id', limit_size = 0) {
        return new Promise(function (resolve, reject) {
            let limit = '';
            if (limit_size > 0) {
                limit = ` limit ${limit_size}`;
            }
            const query = `SELECT * FROM ${table_name} WHERE ${where} ${orderBy} ${limit}`;

            connection.query(query, function (error, results, fields) {
                if (error) reject(error);

                resolve(results);
            });
        });
    }
}

module.exports = DB;