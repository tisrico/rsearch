import sublime
import sublime_plugin
import threading
import http.client
from urllib.parse import urlencode
import os
from datetime import date
import json


hint_search = "type your key words/patten to search"
hint_option = "type your rg/grep options (-nL/-nR is appended automatically)"
hint_search_again = 'select items to re-search'
hint_search_from = 'select path to search from'
search_result_view_name = "Remote search result"
search_result_sheet_head_message = "Searching remotely for \""
search_result_sheet_foot_message = "Search finished\n\n"
search_result_sheet_cancled_message= "Search terminated\n"
search_last_key = ""
search_last_option = '-i'

search_history = []
home_dir = os.path.expanduser("~")

search_window = None
search_thread = None

# def plugin_loaded():
#     with open(home_dir + '\\rsearch.history', 'r') as f:
#         search_history = [line.rstrip() for line in f.readlines()]

# def plugin_unloaded():
#     with open(home_dir + '\\rsearch.history', 'w+') as f:
#         f.writelines("%s\n" % line for line in search_history)

def OutputSearchResult(result):
    find_result = None

    for sheet in search_window.sheets():
        if sheet.view().name() == search_result_view_name:
            find_result = sheet.view()
            search_window.focus_sheet(sheet)
            break

    if find_result is None:
        view = search_window.new_file()
        view.set_name(search_result_view_name)
        view.assign_syntax("Packages/Default/Find Results.hidden-tmLanguage")
        view.settings().set("result_file_regex", r'^([^ \t].*):$')
        view.settings().set("result_line_regex", r"^ +([0-9]+):")
        view.settings().set("detect_indentation", False)
        view.settings().set("auto_indent", False)
        view.settings().set("smart_indent", False)
        view.settings().set("native_tabs", 'system')

        find_result = view

    #find_result.run_command("append", {"characters": result, force: True, scroll_to_end: False})
    find_result.run_command("move_to", {"to": "eof", "extend": False})
    find_result.run_command("insert", {"characters": result})
    find_result.run_command("move_to", {"to": "eof", "extend": False})
    #find_result.run_command("jump_back")

class RemotSearchClass(threading.Thread):
    project = ""
    local_path = ""
    search = ""
    option = ""

    def __init__(self, search, sfrom, option, project, local_path, server, port):
        threading.Thread.__init__(self)

        self.search = search
        self.sfrom = sfrom
        self.option = option
        self.project = project
        self.local_path = local_path
        self.server = server
        self.port = port
        self.cancled = False

    def cancel(self):
        self.cancled = True
        self.conn.close()

    def run(self):
        self.conn = http.client.HTTPConnection(self.server, self.port)
        info = {'key': self.search, 'option':self.option, 'project': self.project, 'local_path': self.local_path, 'sfrom': self.sfrom}

        self.conn.request("GET","/search?" + urlencode(info))
        resp = self.conn.getresponse()

        while chunk := resp.read(4096).decode("utf-8"):
            OutputSearchResult((chunk))
            if self.cancled:
                break

        if self.cancled:
            OutputSearchResult(search_result_sheet_cancled_message)
        else:
            OutputSearchResult(search_result_sheet_foot_message)

class OptionInputHandler(sublime_plugin.TextInputHandler):
    search_option = None
    def __init__(self, preset=None):
        if preset is not None and len(preset) > 0:
            self.search_option = preset

    def initial_text(self):
        return self.search_option

    def placeholder(self):
        return hint_option

class SfromInputHandler(sublime_plugin.ListInputHandler):
    search_from = None

    def __init__(self, sfrom=None):
        if sfrom is not None and len(sfrom) > 0:
            self.search_from = sfrom

    def placeholder(self):
        return hint_search_from

    def list_items(self):
        if self.search_from is None:
            return ['/']
        levels = self.search_from.split('\\')[2:][:-1]
        options = ['/']
        root = ''

        for level in levels:
            root = root + '/' + level
            options.append(root)

        return options

    def next_input(self, args):
        if 'option' not in args:
            return OptionInputHandler(search_last_option)            

class SearchInputHandler(sublime_plugin.TextInputHandler):
    search_key = None
    search_from = None

    def __init__(self, preset=None, sfrom=None):
        if preset is not None and len(preset) > 0:
            self.search_key = preset
        if sfrom is not None and len(sfrom) > 0:
            self.search_from = sfrom

    def initial_text(self):
        return self.search_key

    def placeholder(self):
        return hint_search

    def next_input(self, args):
        if self.search_from is not None:
            print("search from:" + self.search_from)
            return SfromInputHandler(self.search_from)

        if 'option' not in args:
            return OptionInputHandler(search_last_option)

class AgainInputHandler(sublime_plugin.ListInputHandler):
    def placeholder(self):
        return hint_search_again

    def list_items(self):
        return search_history

    def next_input(self, args):
        if 'option' not in args:
            return OptionInputHandler(search_last_option)

class RemoteSearchCommand(sublime_plugin.TextCommand):
    def run(self, edit, search, option, local_path, server, port):
        global search_window
        global search_thread
        global search_last_key
        global search_history
        global search_last_option

        project_file = self.view.window().project_file_name()

        # print(search, project_file, local_path)
        search_window = self.view.window()

        #if search_thread is not None and search_thread.is_alive():
        #    search_thread.cancel()
        #    search_thread.join()

        OutputSearchResult(search_result_sheet_head_message + search + '" "' + option + '" ...\n')
        search_thread = RemotSearchClass(search, '/', option, project_file, local_path, server, port)
        search_thread.start()

        search_last_key = search
        search_last_option = option

        if search in search_history:
            search_history.remove(search)
        search_history.insert(0, search)

        # print("Post search", search_last_key)

    def input(self, args):
        sel = self.view.sel()[0]
        selected = self.view.substr(sel)

        if "" == selected:
            selected = search_last_key

        return SearchInputHandler(selected)

    def input_description(self):
        return 'Remote search'

class RemoteSearchAgainCommand(sublime_plugin.TextCommand):
    def run(self, edit, again, option, local_path, server, port):
        global search_window
        global search_thread
        global search_last_key
        global search_history
        global search_last_option

        project_file = self.view.window().project_file_name()

        # print(again, project_file, local_path)
        search_window = self.view.window()

        #if search_thread is not None and search_thread.is_alive():
        #    search_thread.cancel()
        #    search_thread.join()

        OutputSearchResult(search_result_sheet_head_message + again + '" "' + option + '" ...\n')
        search_thread = RemotSearchClass(again, '/', option, project_file, local_path, server, port)
        search_thread.start()

        search_last_key = again
        search_last_option = option

        if again in search_history:
            search_history.remove(again)
        search_history.insert(0, again)

        # print("Post again", search_last_key)

    def input(self, args):
        return AgainInputHandler()

    def input_description(self):
        return 'Remote search again'


class RemoteSearchFromCommand(sublime_plugin.TextCommand):
    def run(self, edit, search, sfrom, option, local_path, server, port):
        global search_window
        global search_thread
        global search_last_key
        global search_history
        global search_last_option

        project_file = self.view.window().project_file_name()

        # print(search, project_file, local_path)
        search_window = self.view.window()

        #if search_thread is not None and search_thread.is_alive():
        #    search_thread.cancel()
        #    search_thread.join()

        OutputSearchResult(search_result_sheet_head_message + search + '" "' + option + '" from "' + sfrom + '" ...\n')
        search_thread = RemotSearchClass(search, sfrom, option, project_file, local_path, server, port)
        search_thread.start()

        search_last_key = search
        search_last_option = option

        if search in search_history:
            search_history.remove(search)
        search_history.insert(0, search)

        # print("Post search", search_last_key)

    def input(self, args):
        sel = self.view.sel()[0]
        selected = self.view.substr(sel)

        if "" == selected:
            selected = search_last_key

        return SearchInputHandler(selected, self.view.file_name())

    def input_description(self):
        return 'Remote search from'

class FavorMessageInputHandler(sublime_plugin.TextInputHandler):
    desc = None
    def __init__(self, preset=None): 
        self.desc = preset

    def initial_text(self):
        return self.desc

    def placeholder(self):
        return "give a description" 

class FavorFileCommand(sublime_plugin.TextCommand):
    row = 0
    def run(self, edit, favor_message):
        project_file = self.view.window().project_file_name()
        project = os.path.basename(project_file)
        project = os.path.splitext(project)[0]

        path = self.view.file_name()
        existing_data = {}

        data = {}
        data["file"] = path
        data["line"] = str(self.row)
        data["mesg"] = favor_message
        data["date"] = date.today().strftime("%Y-%m-%d")

        with open(home_dir + '\\' + project + '_ff.txt') as f:
            existing_data = json.load(f)

        existing_data.append(data)

        with open(home_dir + '\\' + project + '_ff.txt', 'w') as f:
            f.write(json.dumps(existing_data, indent="\t"))

    def input(self, args):
        sel = self.view.sel()[0]
        selected = self.view.substr(sel)
        (self.row, col) = self.view.rowcol(self.view.sel()[0].begin())

        return FavorMessageInputHandler(selected)

class ListFavorMessageInputHandler(sublime_plugin.ListInputHandler):
    data = {}
    project = ""
    def __init__(self, project_):
        project = project_
        print(project)
        with open(home_dir + '\\' + project + '_ff.txt') as f:
            self.data = json.load(f)

    def list_items(self):
        li = []
        for o in self.data:
            message = o["date"] + " " + o["mesg"] + " " + o["file"]
            li.append((message, o))

        return li

    def placeholder(self):
        return "search by description and file name" 

class ListFavorFileCommand(sublime_plugin.TextCommand):
    def run(self, edit, list_favor_message):
        print(list_favor_message)
        view = self.view.window().open_file(list_favor_message["file"])
        view.window().run_command("show_overlay", {"overlay":"goto", "text": ":" + list_favor_message["line"]})

    def input(self, args):
        project_file = self.view.window().project_file_name()
        project = os.path.basename(project_file)
        project = os.path.splitext(project)[0]
        return ListFavorMessageInputHandler(project)

