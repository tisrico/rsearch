const express = require('express');
const url = require('url');
const path = require('path');
const spawn = require('child_process').spawn

const app = express();
const port = 8080;

const server_root = '/home/rico.wang/Src';
const max_match = 1024;
const max_message = 'Max matches allowed to return has reached.\n';

app.get('/search', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;
    // console.log(query.key, query.project, query.local_path);

    let search_root = server_root + '/' + query.project + query.sfrom;
    let search = query.key;
    let param = ['-A3', '-B3', '-nL', '--heading'];

    if(query.option) {
        param.push(query.option);
    }
    param.push(search);
    param.push(search_root);
    let found = 0;
    let done = false;
    let findex = 1;
    let prev_line = -1;

    let grep = spawn('rg', param);
    // console.log(param);

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
        let lines = data.toString();
        lines = lines.split('\n');

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
            let file_section = false;

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
                    if(found >= max_match) {
                        done = true;
                    }

                    if('--' ==  line) {
                        line = current_file;
                        file_section = true;
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

            function devider() {
                let ext = path.extname(current_file);
                let name = path.basename(current_file);
                //console.log(current_file, ext, name);

                // c/cpp/hpp/h
                let ret = '// #';

                let main = '#######################DEVIDER-INSERTED#####################';
                if (ext == '.xml' || ext == '.html') {
                    ret = '<!--';
                }

                if (ext == '.lua' || ext == '.sh' || name =='Makefile' || 
                    name == 'CMakeLists.txt' || ext == '.mk') {
                    ret = '####';
                }

                ret += main;

                if (ext == '.xml' || ext == '.html') {
                    ret = '-->';
                }

                if(ext == '.json') {
                    ret = '';
                }

                return ret;
            }

            if (line_number != '' && found <= max_match) {
                // console.log('add line: ' + line_number);
                current_data.push({
                    line_number: line_number,
                    line_hit: line_hit,
                    content: content,
                    line_section: false
                });
                prev_line = line_number;
                return;
            }
            else if (file_section && found <= max_match) {
                current_data.push({
                    line_number: parseInt(prev_line) + 1,
                    line_hit: false,
                    content: devider(),
                    line_section: true
                });

                // console.log("xx@line: " + (prev_line + 1));
            }

            // console.log(done, file, current_file, current_file.length);
            if ((done || file != current_file) && current_data.length > 0) {

                // console.log("batch output");
                let count = 0;
                current_data.map((r)=>{ if(r.line_hit) count++});
                result.push(`<${findex++}> <${count}>`);

                let head = current_file.slice(server_root.length);
                head = query.local_path + head.split('/').join('\\');
                result.push(head + ':');

                current_data.sort((a, b)=>{ return a.line_number - b.line_number});

                let last_line = current_data[current_data.length -1].line_number;
                let width = last_line.toString().length + 2;
                current_data.map((record)=>{
                    let out = str_prefix(record.line_number, width);
                    out += record.line_hit?': ':'  ';
                    out += record.content;
                    result.push(out);
                });

                result.push('\n');
                current_data = [];

                current_file = file;
            }

        });

        return result.join('\n');
    }

    function push_time(res) {
        let now = new Date();
        res.write("Server side processing time: " + (now-start)/1000 + " seconds, ");
        res.write("matches: " + found + ".\n");
        console.log({key: query.key, option: query.option, time: (now-start)/1000, found: found, date: now});
    }

    grep.stdout.on('data', (data)=>{
        if (done) {
            // console.log("done!\n");
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

    res.write(`Results from ${query.project}\n\n`);

});

app.listen(port, function() {
    console.log(`Remote search(rg backed) app listening on port ${port}!`);
});
