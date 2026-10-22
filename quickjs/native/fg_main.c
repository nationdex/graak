/*
 * Entry point for the C build of the Graak runtime.
 *
 * Deliberately small: it starts the engine, installs the native layer, runs a script and drains
 * the job queue. Everything else lives in JavaScript, exactly as with the Rust host, so the two
 * backends stay interchangeable rather than drifting apart.
 */

#include "quickjs-libc.h"
#include "quickjs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifndef _WIN32
#include <sys/stat.h>
#endif

void graak_native_init(JSContext *ctx);
int fg_sea_prepare(int *argc, char ***argv);
char *fg_sea_read_file(const char *path, size_t *len);
int fg_sea_is_active(void);
JSModuleDef *fg_sea_module_loader(JSContext *ctx, const char *name, void *opaque, JSValueConst attributes);
void graak_napi_shutdown(void);

static char *read_file(const char *path, size_t *len_out)
{
    FILE *file = fopen(path, "rb");
    long size;
    char *buffer;

    if (!file) {
        return NULL;
    }
#ifndef _WIN32
    {
        /* A script is a regular file. Checked on the open file, so it cannot be swapped for a device or a pipe in between. */
        struct stat st;
        if (fstat(fileno(file), &st) != 0 || !S_ISREG(st.st_mode)) {
            fclose(file);
            return NULL;
        }
    }
#endif
    fseek(file, 0, SEEK_END);
    size = ftell(file);
    fseek(file, 0, SEEK_SET);
    if (size < 0) {
        fclose(file);
        return NULL;
    }
    buffer = malloc((size_t) size + 1);
    if (!buffer) {
        fclose(file);
        return NULL;
    }
    if (fread(buffer, 1, (size_t) size, file) != (size_t) size) {
        free(buffer);
        fclose(file);
        return NULL;
    }
    fclose(file);
    buffer[size] = '\0';
    *len_out = (size_t) size;
    return buffer;
}

int main(int argc, char **argv)
{
    JSRuntime *rt;
    JSContext *ctx;
    char *source;
    size_t len;
    JSValue result;
    int status = 0;

    /* A single-file build carries its application after the executable; index it and run it from there. */
    if (fg_sea_prepare(&argc, &argv) < 0) {
        return 1;
    }

    if (argc < 2) {
        fprintf(stderr, "usage: %s <script.js> [args...]\n\n", argv[0]);
        fprintf(stderr, "Runs a script on quickjs-ng with native sockets, TLS, crypto and compression.\n");
        return 2;
    }

#ifdef _WIN32
    /* The engine resolves a module's relative imports by splitting its name on '/'. A Windows launcher
       naturally passes backslashes, under which `./node-web.js` next to `C:\\app\\node-compat.js` is never
       found, so the script path is given forward slashes, which Windows accepts everywhere. */
    {
        char *c;
        for (c = argv[1]; *c; c++) {
            if (*c == '\\') *c = '/';
        }
    }
#endif

    rt = JS_NewRuntime();
    if (!rt) {
        fprintf(stderr, "graak: could not create the JavaScript runtime\n");
        return 1;
    }
    ctx = JS_NewContext(rt);
    if (!ctx) {
        JS_FreeRuntime(rt);
        fprintf(stderr, "graak: could not create the JavaScript context\n");
        return 1;
    }

    /* The engine's own std/os modules supply timers, files and the module loader; the native
       layer adds what they lack. Together they match what the Rust host provides. */
    js_std_init_handlers(rt);
    /* An unhandled rejection is an error in the program, not something to ignore: report it and fail. */
    JS_SetHostPromiseRejectionTracker(rt, js_std_promise_rejection_tracker, NULL);
    /* The engine's loader, except that a single-file build's modules are read from its payload. */
    JS_SetModuleLoaderFunc2(rt, NULL, fg_sea_module_loader, js_module_check_attributes, NULL);
    js_init_module_std(ctx, "qjs:std");
    js_init_module_os(ctx, "qjs:os");
    js_std_add_helpers(ctx, argc - 1, argv + 1);

    graak_native_init(ctx);

    source = fg_sea_read_file(argv[1], &len);
    if (!source && !fg_sea_is_active()) {
        /* A packaged program runs only from its payload; loose files are for the plain host (graak-c script.js). */
        source = read_file(argv[1], &len);
    }
    if (!source) {
        fprintf(stderr, "graak: cannot read '%s'\n", argv[1]);
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
        return 1;
    }

    /* Evaluated as a module so that top-level await works, which the socket API needs. */
    result = JS_Eval(ctx, source, len, argv[1], JS_EVAL_TYPE_MODULE);
    free(source);

    if (JS_IsException(result)) {
        js_std_dump_error(ctx);
        status = 1;
        JS_FreeValue(ctx, result);
    } else {
        /* Pending promises and timers still need to run before the process ends. The engine's loop stops
           for good the moment a queued job throws, silently dropping every timer and socket handler after
           it, so an exception is handed to the program's uncaught-exception path (Node's behaviour: a
           listener may handle it, otherwise it is printed and the process exits 1) and the loop resumes. */
        int before_exit_done = 0;
        for (;;) {
            js_std_loop(ctx);
            if (!JS_HasException(ctx)) {
                /* The loop ran dry. 'beforeExit' may schedule more work, in which case the loop runs again. */
                if (!before_exit_done) {
                    JSValue global = JS_GetGlobalObject(ctx);
                    JSValue hook = JS_GetPropertyStr(ctx, global, "__graak_beforeExit");
                    before_exit_done = 1;
                    if (JS_IsFunction(ctx, hook)) {
                        JSValue r = JS_Call(ctx, hook, JS_UNDEFINED, 0, NULL);
                        JS_FreeValue(ctx, r);
                        JS_FreeValue(ctx, hook);
                        JS_FreeValue(ctx, global);
                        continue;
                    }
                    JS_FreeValue(ctx, hook);
                    JS_FreeValue(ctx, global);
                }
                break;
            }
            {
                JSValue exc = JS_GetException(ctx);
                JSValue global = JS_GetGlobalObject(ctx);
                JSValue reporter = JS_GetPropertyStr(ctx, global, "__graak_reportUncaught");
                int handled = 0;
                if (JS_IsFunction(ctx, reporter)) {
                    JSValue r = JS_Call(ctx, reporter, JS_UNDEFINED, 1, &exc);
                    if (JS_IsException(r)) {
                        js_std_dump_error(ctx);
                    } else {
                        handled = 1;
                    }
                    JS_FreeValue(ctx, r);
                } else {
                    JS_Throw(ctx, JS_DupValue(ctx, exc));
                    js_std_dump_error(ctx);
                }
                JS_FreeValue(ctx, reporter);
                JS_FreeValue(ctx, global);
                JS_FreeValue(ctx, exc);
                if (!handled) {
                    status = 1;
                    break;
                }
            }
        }

        /* 'exit' listeners run, and process.exitCode becomes the status, as they do when Node ends. */
        if (status == 0) {
            JSValue global = JS_GetGlobalObject(ctx);
            JSValue hook = JS_GetPropertyStr(ctx, global, "__graak_exit");
            if (JS_IsFunction(ctx, hook)) {
                JSValue r = JS_Call(ctx, hook, JS_UNDEFINED, 0, NULL);
                int32_t code = 0;
                if (!JS_IsException(r) && JS_ToInt32(ctx, &code, r) == 0) {
                    status = (int) code;
                }
                JS_FreeValue(ctx, r);
            }
            JS_FreeValue(ctx, hook);
            JS_FreeValue(ctx, global);
        }

        /* A module with top-level await evaluates to a promise, and an error thrown by the script
           rejects it. Without this check the process would exit 0 having silently failed. */
        if (JS_PromiseState(ctx, result) == JS_PROMISE_REJECTED) {
            JSValue reason = JS_PromiseResult(ctx, result);
            JS_Throw(ctx, reason);
            js_std_dump_error(ctx);
            status = 1;
        }
        JS_FreeValue(ctx, result);
    }

    /* Addons get their cleanup hooks while the engine is still alive to be called into. */
    graak_napi_shutdown();

    js_std_free_handlers(rt);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return status;
}
