require('request-promise')({
    url: 'http://lumtest.com/myip.json',
    proxy: 'http://127.0.0.1:24000'
}).then(function (data) { console.log(data); }, function (err) { console.error(err); });
