const express = require('express');
const url = require('url');
const path = require('path');
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;

const app = express();
const port = 8080;

const server_root = '/home/rico.wang/Src';
const max_match = 1024;
const max_message = 'Max matches allowed to return has reached.\n';

app.get('/filename', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;

    // console.log(query);
    let search_root = server_root + '/' + query.project + query.sfrom;
    let search = query.key;

    let param = ['-L', search_root];
    let find = spawn('find', param);
    var done = false;
    var found = 0;
    var offset = server_root.length;

    const re = new RegExp(search);

    function push(data) {
        result = [];
        let lines = data.toString();
        lines = lines.split('\n');

        lines.map((line) => {
            line = line.slice(offset);
            if (done || !line.match(re)) {
                return;
            }

            line = query.local_path + line.split('/').join('\\');
            found++;

            result.push("<" + found + ">");
            result.push(line + ":");
            result.push("");

            if (found == max_match) {
                done = true;
            }
        });

        result = result.join("\n");
        if (result.length) {
            return result + "\n";
        }

        return result;
   }

    find.stdout.on('data', (data)=>{
        if (done) {
            // console.log("done!\n");
            return;
        }

        res.write(push(data));
        if (done) {
          res.write(max_message);
          find.kill('SIGINT');
        }
    });

    find.stderr.on('data', (data)=>{
        // console.log(data.toString());
        // res.write(data);
    });

    function push_time(res) {
        let now = new Date();
        res.write("Server side processing time: " + (now-start)/1000 + " seconds, ");
        res.write("matches: " + found + ".\n");
        console.log({key: query.key, time: (now-start)/1000, found: found, date: now});
    }

    find.on('close', (code)=>{
        // console.log(code);
        push_time(res);
        res.end();
    });

    res.write(`Results from ${query.project}\n\n`);

});

app.get('/search', function(req, res) {
    let start = new Date();
    let query = url.parse(req.url, true).query;
    query.project = path.parse(query.project.split('\\').join('/')).name;
    // console.log(query.key, query.project, query.local_path, query);

    let search_root = server_root + '/' + query.project + query.sfrom;
    let search = query.key;
    let param = ['-A3', '-B3', '-nL', '--heading', '--no-ignore', '-g', '!{node_modules,.svn,.git}/'];

    param.push(query.option)
    param.push(search);
    param.push(search_root);
    let found = 0;
    let done = false;
    let findex = 1;
    let prev_line = -1;

    let grep = spawn('rg', param);
    // console.log('rg ' + param.join(" "));

    let current_file = "";
    let current_data = [];
    let file_list = []; 

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

            let reg_ba = /^([0-9]+)-(.*)/;
            let reg_hit = /^([0-9]+):(.*)/;

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

                    if (line.length && line[0] == '/' && line.length < 512) {
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
                file_list.push(`<${findex}> <${count}>`);
                result.push(`<${findex++}> <${count}>`);

                let head = current_file.slice(server_root.length);
                head = query.local_path + head.split('/').join('\\');
                result.push(head + ':');
                file_list.push(head + ':');

                current_data.sort((a, b)=>{ return a.line_number - b.line_number});

                let last_line = current_data[current_data.length -1].line_number;
                let width = last_line.toString().length + 2;
                current_data.map((record)=>{
                    let out = str_prefix(record.line_number, width);
                    out += record.line_hit?': ':'  ';
                    out += record.content.slice(0, 512);
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
        res.write(file_list.join("\n") + "\n");

        let now = new Date();
        res.write("\nServer side processing time: " + (now-start)/1000 + " seconds, ");
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

var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/rg_search.log', {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};

app.get('/blame', function(req, res) {
    let query = url.parse(req.url, true).query;
    let project = path.parse(query.project.split('\\').join('/')).name;
    let local_path = '~/Src' + query.local_path.replace(/\\/g, '/').slice(2);
    let cmd = "svn blame $(readlink -f " + local_path + ")";

    let blame = exec(cmd);

    blame.stdout.on('data', (data)=>{
        res.write(data);
    });

    blame.stderr.on('data', (data)=>{
        // console.log(data.toString());
        // res.write(data);
    });

    blame.on('close', (code)=>{
        let cmd = "svn log $(readlink -f " + local_path + ")";
        let log = exec(cmd);

        log.stdout.on('data', (data)=>{
            res.write(data);
        });

        log.stderr.on('data', (data)=>{
            // console.log(data.toString());
            // res.write(data);
        });

        log.on('close', (code)=>{
            res.end();
        });
    });
});

app.get('/diff', function(req, res) {
    let query = url.parse(req.url, true).query;
	console.log(query);
    let project = path.parse(query.project.split('\\').join('/')).name;
    let option = JSON.parse(query.option.replace(/'/g,'"'));
    let revision = option.revision;

    query.project = path.parse(query.project.split('\\').join('/')).name;
    let search_root = server_root + '/' + query.project;

    let cmd = "svn log http://svn/main -c " + revision;
    cmd += ";" + "svn diff http://svn/main -c " + revision;

    if (revision == '') {
        let search_index = server_root + '/' + query.project + "/index.json";
        search_root = "";

        try {
            // for virtual project workspace
            search_root = JSON.parse(fs.readFileSync(search_index)).target;
        }
        catch(err) {
            search_root = server_root + '/' + query.project;
        }

        try {
            fs.accessSync(search_root + "/ws.cfg", fs.constants.F_OK)
            cmd = "ws diff";
        }
        catch(err) {
            cmd = "svn diff";
        }
    }

    // console.log(cmd, search_root);

    let diff = exec(cmd, {cwd: search_root} );
    let index = 0;

    diff.stdout.on('data', (data)=>{
        if (index++ < 256) {
            res.write(data);
        }
    });

    diff.stderr.on('data', (data)=>{
        // console.log(data.toString());
        // res.write(data);
    });

    diff.on('close', (code)=>{
        res.write("\n\n");
        res.end();
    });
});
