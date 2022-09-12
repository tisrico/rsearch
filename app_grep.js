const express = require('express');
const url = require('url');
const path = require('path');
const spawn = require('child_process').spawn

const app = express();
const port = 8080;

const server_root = '/home/rico.wang/Src';
const max_line = 4*1024;
const max_match = 512;
const max_message = '\n!!! Max match/number of line allowed to return has reached.\n';

app.get('/search', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;
    console.log(query.key, query.project, query.local_path);

    let search_root = server_root + '/' + query.project;
    let search = query.key;
    let param = ['-A3', '-B3', '-niR'];
    param.push('--exclude-dir=.svn');
    param.push('--exclude-dir=.git')
    param.push('--exclude-dir=.target_*');
    // param.push('--max-count=' + max_match);
    param.push(search);
    param.push(search_root);
    let out_count = 0;
    let found = 0;

    let grep = spawn('grep', param);
    console.log(param);

    let buffer = "";
    let current_file = "";
    let current_data = [];

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
        buffer += data.toString();
        let lines = buffer.split('\n');
        // console.log(data.toString());

        lines.map((line)=>{

            let reg_ba = /(^.*)-([0-9]+)-(.*)/;
            let reg_hit = /(^.*):([0-9]+):(.*)/;

            let file = '';
            let line_number ='';
            let content = '';
            let line_hit = false;

            let match = reg_ba.exec(line);
            if (match) {
                file = match[1];
                line_number = match[2];
                content = match[3];
            }
            else {
                match = reg_hit.exec(line);
                if (match) {
                    line_hit = true;
                    file = match[1];
                    line_number = match[2];
                    content = match[3];
                    found ++;
                }
                else {
                    // file switch
                    file = ""
                }
            }

            if(file != "") {
                if(current_file == "") {
                    current_file = file;
                    // console.log("entered file: " + file);
                }
                // console.log("add line: " + line_number);
                current_data.push({
                    line_number: line_number,
                    line_hit: line_hit,
                    content: content
                });
            }
            
            if (file != current_file && current_data.length > 0) {

                let head = current_file.slice(server_root.length);
                head = query.local_path + head.split('/').join('\\');
                result.push(head + ':');

                let last_line = current_data[current_data.length -1].line_number;
                let width = last_line.toString().length + 2;
                current_data.map((record)=>{
                    let out = str_prefix(record.line_number, width);
                    out += record.line_hit?": ":"  ";
                    out += record.content;
                    result.push(out);
                    out_count ++;
                });

                result.push("");
                current_file = file;
                current_data = [];
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
        if (out_count > max_line || found > max_match) {
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
    console.log(`Rsearch(grep backed) app listening on port ${port}!`);
});
