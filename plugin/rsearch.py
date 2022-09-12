import sublime
import sublime_plugin
import threading
import http.client
from urllib.parse import urlencode
import os

hint_search = "type your key words/patten to search"
hint_option = "type your rg/grep options (-nL/-nR is appended automatically)"
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

    def __init__(self, search, option, project, local_path, server, port):
        threading.Thread.__init__(self)

        self.search = search
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
        info = {'key': self.search, 'option':self.option, 'project': self.project, 'local_path': self.local_path}

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

class SearchInputHandler(sublime_plugin.TextInputHandler):
    search_key = ""
    def __init__(self, preset=None):
        if preset is not None and len(preset) > 0:
            self.search_key = preset

    def initial_text(self):
        return self.search_key

    def placeholder(self):
        return hint_search

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
        search_thread = RemotSearchClass(search, option, project_file, local_path, server, port)
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
        return 'Search on remote host'


