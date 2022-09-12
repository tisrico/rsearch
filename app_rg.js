const express = require('express');
const url = require('url');
const path = require('path');
const spawn = require('child_process').spawn

const app = express();
const port = 8080;

const server_root = '/home/rico.wang/Src';
const max_match = 1024;
const max_line = 8 * 1024;
const max_message = 'Max matches allowed to return has reached.\n';


app.get('/search', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;
    // console.log(query.key, query.project, query.local_path);

    let search_root = server_root + '/' + query.project;
    let search = query.key;
    let param = ['-A2', '-B2', '-niL', '--heading'];
    param.push(search);
    param.push(search_root);
    let found = 0;
    let done = false;

    let grep = spawn('rg', param);
    //console.log(param);

    let buffer = "";
    let current_file = "";
    let current_data = [];

    function str_prefix(s, n) {
        let str = s.toString();
        let c = n - str.length;
        for (let i=0; i<c; i++) {
            str = ' ' + str;
        }
        return str;
    }

    function push(data) {
        // console.log(data.toString());
        result = [];
        buffer += data.toString();
        let lines = buffer.split('\n');

        lines.map((line)=>{
            if (done) {
                return;
            }

            let reg_ba = /([0-9]+)-(.*)/;
            let reg_hit = /([0-9]+):(.*)/;

            let file = '';
            let line_number ='';
            let content = '';
            let line_hit = false;

            let match = reg_ba.exec(line);
            if (match) {
                line_number = match[1];
                content = match[2];
                // console.log("ab: " + line_number);
            }
            else {
                match = reg_hit.exec(line);
                if (match) {
                    line_hit = true;
                    found ++;

                    line_number = match[1];
                    content = match[2];

                    // console.log("ma: " + line_number);
                }
                else {
                    if(found == max_match) {
                        done = true;
                    }

                    if (line.length && line[0] == '/') {
                        file = line;
                        if (current_file == '') {
                            current_file = file;
                        }
                    }
                    else {
                        file = '';
                    }
                    // console.log("file: " + file);
                }
            }

            if (line_number != '' && found <= max_match) {
                // console.log('add line: ' + line_number);
                current_data.push({
                    line_number: line_number,
                    line_hit: line_hit,
                    content: content
                });
                return;
            }

            //console.log(done, file, current_file, current_file.length);
            if ((done || file != current_file) && current_data.length > 0) {

                let head = current_file.slice(server_root.length);
                head = query.local_path + head.split('/').join('\\');
                result.push(head + ':');

                let last_line = current_data[current_data.length -1].line_number;
                let width = last_line.toString().length + 2;
                current_data.map((record)=>{
                    let out = str_prefix(record.line_number, width);
                    out += record.line_hit?': ':'  ';
                    out += record.content;
                    result.push(out);
                });

                result.push('');
                current_data = [];

                current_file = file;
            }

        });

        return result.join('\n');
    }

    function push_time(res) {
        let now = new Date();
        res.write("\nServer side processing time: " + (now-start)/1000 + " seconds, ");
        res.write("matches: " + found + (done ? "(max).\n" : ".\n"));
        console.log({key: query.key, time: (now-start)/1000, found: found, date: now});
    }

    grep.stdout.on('data', (data)=>{
        if (done) {
            console.log("done!\n");
            return;
        }

        res.write(push(data));
        if (done) {
          res.write(max_message);
          grep.kill('SIGINT');
        }
    });

    grep.stderr.on('data', (data)=>{
        // console.log(data.toString());
        // res.write(data);
    });

    grep.on('close', (code)=>{
        // console.log(code);
        push_time(res);
        res.end();
    });

});

app.listen(port, function() {
    console.log(`Remote search(rg backed) app listening on port ${port}!`);
});

/* this based on json format
const express = require('express');
const url = require('url');
const path = require('path');
const spawn = require('child_process').spawn

const app = express();
const port = 8081;

const server_root = '/home/rico.wang/Src';
const max_match = 102400000;
const max_message = 'Max match/number of line allowed to return has reached.\n';


app.get('/search', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;
    console.log(query.key, query.project, query.local_path);

    let search_root = server_root + '/' + query.project;
    let search = query.key;
    let param = ['-A3', '-B3', '-niL'];
    //param.push('--iglob !.svn !.git !.target_');
    //param.push('--max-filesize 1M'); 
    param.push('--json'); 
    param.push(search);
    param.push(search_root);

    let found = 0;
    let records = [];

    let grep = spawn('rg', param);
    console.log(param);

    function str_prefix(s, n) {
        let str = s.toString();
        let c = n - str.length;
        for(let i=0; i<c; i++) {
            str = ' ' + str;
        }
        return str;
    }

    function push(data) {
        result = [];
        let buffer = data.toString();
        let lines = buffer.split('\n');
        // console.log(data.toString());

        lines.map((line)=>{
            if (line == '') {
                return;
            }

            line = line.replace(/[\n\r]+/, '');

            let lo;
            try {
                lo = JSON.parse(line);
            }
            catch(err) {
                console.log(line);
                return;
            }

            if (lo.type == 'context' || lo.type == 'match') {
                records.push(lo);
                return;
            }

            if (lo.type == 'end' && records.length > 0) {
                let head = lo.data.path.text.slice(server_root.length);
                head = query.local_path + head.split('/').join('\\');
                head += ':';
                result.push(head);

                let last_line = records[records.length -1].data.line_number;
                let width = last_line.toString().length + 2;

                records.map((record)=>{
                    let out = str_prefix(record.data.line_number, width);
                    if (record.type == 'match') {
                        out += ': ';
                        found ++;
                    }
                    else {
                        out += '  ';
                    }
                    out += record.data.lines.text.replace(/[\n\r]+/, '');
                    result.push(out);
                });

                result.push('');
            }
        });

        return result.join('\n');
    }

    function push_time(res) {
        let now = new Date();
        res.write("\nServer side processing time: " + (now-start)/1000 + " seconds, ");
        res.write("matches: " + found + ". \n");
    }
    
    grep.stdout.on('data', (data)=>{
        res.write(push(data));
        if (found >= max_match) {
          res.write(max_message);
          grep.kill('SIGINT');
        }
    });

    grep.stderr.on('data', (data)=>{
        // console.log(data.toString());
        // res.write(data); 
    });

    grep.on('close', (code)=>{
        console.log(code);
        push_time(res);
        res.end();
    });

});

app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});
*/
