/*
 * The layout of async stack frames
 *
 * < previous frames>
 * --------------------- 
 * pointer to the previous frame <-- __async_cur_frame
 * saved sp
 * callback function   <-- ctx, returned by alloc/reallloc, used by the program
 * saved local variable1
 * saved local variable2
 * ...
 * --------------------- <-- __async_stacktop
 *
 */

mergeInto(LibraryManager.library, {
  __async: 0, // whether a truly async function has been called
  __async_unwind: 1, // whether to unwind the async stack frame
  __async_stacktop: 'allocate(5*1024*1024, "i32", ALLOC_STATIC)', // where we store async stack frames
  __async_retval: 'allocate(2, "i32", ALLOC_STATIC)', // store the return value for async functions
  __async_cur_frame: 0, // address to the current frame, which stores previous frame, stack pointer and async context

  emscripten_async_stack_save__deps: ['__async_stacktop'],
  emscripten_async_stack_save__sig: 'i',
  emscripten_async_stack_save__asm: true,
  emscripten_async_stack_save: function() {
    return ___async_stacktop|0;
  },

  emscripten_async_stack_restore__deps: ['__async_stacktop'],
  emscripten_async_stack_restore__sig: 'vi',
  emscripten_async_stack_restore__asm: true,
  emscripten_async_stack_restore: function(top) {
    top = top|0;
    ___async_stacktop = top;
  },

  emscripten_async_stack_alloc__deps: ['__async_stacktop'],
  emscripten_async_stack_alloc__sig: 'ii',
  emscripten_async_stack_alloc__asm: true,
  emscripten_async_stack_alloc: function(size) {
    size = size|0;
    var ret = 0;
    ret = ___async_stacktop;
    ___async_stacktop = (___async_stacktop + size)|0;
    ___async_stacktop = (___async_stacktop + 7)&-8;
    return ret|0;
  },

#if ASYNCIFY
  emscripten_async_resume__deps: ['__async', '__async_unwind', '__async_cur_frame', 'emscripten_async_stack_restore'],
#else
  emscripten_async_resume__deps: [ function(){ throw 'ERROR: Please compile your program with -s ASYNCIFY=1 in order to use asynchronous operations like emscripten_sleep'; } ],
#endif
  emscripten_async_resume__sig: 'v',
  emscripten_async_resume__asm: true,
  emscripten_async_resume: function() {
    var callback = 0;
    ___async = 0;
    ___async_unwind = 1;
    while (1) {
      if (!___async_cur_frame) return;
      callback = {{{ makeGetValueAsm('___async_cur_frame', 8, 'i32') }}};
      // the signature of callback is always vi
      // the only argument is ctx
      dynCall_vi(callback, (___async_cur_frame + 8)|0);
      if (___async) return; // that was an async call
      if (!___async_unwind) {
        // keep the async stack
        ___async_unwind = 1;
        continue;
      }
      // unwind normal stack frame
      stackRestore({{{ makeGetValueAsm('___async_cur_frame', 4, 'i32') }}});
      // pop the last async stack frame
      _emscripten_async_stack_restore(___async_cur_frame);
      ___async_cur_frame = {{{ makeGetValueAsm('___async_cur_frame', 0, 'i32') }}};
    }
  },

  emscripten_sleep__deps: ['emscripten_async_resume'],
  emscripten_sleep: function(ms) {
    asm.setAsync(); // tell the scheduler that we have a callback on hold
    Browser.safeSetTimeout(_emscripten_async_resume, ms);
  },

  emscripten_alloc_async_context__deps: ['__async_cur_frame', 'emscripten_async_stack_alloc'],
  emscripten_alloc_async_context__sig: 'ii',
  emscripten_alloc_async_context__asm: true,
  emscripten_alloc_async_context: function(len) {
    len = len|0;
    // len is the size of ctx
    // we also need to store prev_frame, stack pointer before ctx
    var new_frame = 0; new_frame = _emscripten_async_stack_alloc((len + 8)|0)|0;
    // link the frame with previous one
    {{{ makeSetValueAsm('new_frame', 0, '___async_cur_frame', 'i32') }}};
    ___async_cur_frame = new_frame;
    return (___async_cur_frame + 8)|0;
  },
  
  emscripten_realloc_async_context__deps: ['__async_cur_frame', 'emscripten_async_stack_alloc', 'emscripten_async_stack_restore'],
  emscripten_realloc_async_context__sig: 'ii',
  emscripten_realloc_async_context__asm: true,
  emscripten_realloc_async_context: function(len) {
    len = len|0;
    // assuming that we have on the stacktop
    _emscripten_async_stack_restore(___async_cur_frame);
    return ((_emscripten_async_stack_alloc((len + 8)|0)|0) + 8)|0;
  },

  emscripten_free_async_context__deps: ['__async_cur_frame', 'emscripten_async_stack_restore'],
  emscripten_free_async_context__sig: 'vi',
  emscripten_free_async_context__asm: true,
  emscripten_free_async_context: function(ctx) {
    //  this function is called when a possibly async function turned out to be sync
    //  just undo a recent emscripten_alloc_async_context
    ctx = ctx|0;
    _emscripten_async_stack_restore(___async_cur_frame);
    ___async_cur_frame = {{{ makeGetValueAsm('___async_cur_frame', 0, 'i32') }}};
  },

  emscripten_save_async_stack_pointer: true,
  emscripten_check_async: true,
  emscripten_do_not_unwind: true,
  emscripten_do_not_unwind_async: true,

  emscripten_get_async_return_value_addr__deps: ['__async_retval'],
  emscripten_get_async_return_value_addr: true
});
