// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http');

const ENDPOINTS = [
    '/api/graviton/metrics',
    '/api/graviton/deficit',
    '/api/graviton/all-products'
];

const BASE_URL = 'http://localhost:3001';

// Add headers to bypass authentication
const OPTIONS = {
    headers: {
        'Cookie': 'bypass_auth=true'
    }
};

async function fetchUrl(path) {
    const start = performance.now();
    return new Promise((resolve) => {
        http.get(BASE_URL + path, OPTIONS, (res) => { // Passed OPTIONS here
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const end = performance.now();
                resolve({
                    path,
                    status: res.statusCode,
                    time: end - start,
                    error: res.statusCode !== 200 ? `Status ${res.statusCode}` : null
                });
            });
        }).on('error', (err) => {
            resolve({ path, status: 'ERROR', time: 0, error: err.message });
        });
    });
}

async function runBenchmark() {
    console.log('🚀 Starting API Benchmark on ' + BASE_URL + ' (Auth Bypassed)');

    // 1. Warmup
    console.log('\n--- Warming up ---');
    for (const ep of ENDPOINTS) await fetchUrl(ep);

    // 2. Latency Test (Sequential)
    console.log('\n--- Sequential Latency Test (Average of 5 runs) ---');
    for (const ep of ENDPOINTS) {
        let totalTime = 0;
        const codes = [];
        for (let i = 0; i < 5; i++) {
            const res = await fetchUrl(ep);
            totalTime += res.time;
            codes.push(res.status);
        }
        const uniqueCodes = [...new Set(codes)];
        console.log(`${ep}: ${(totalTime / 5).toFixed(2)}ms [Status: ${uniqueCodes.join(', ')}]`);
    }

    // 3. Concurrency Test
    console.log('\n--- Concurrency Test (Load Simulation) ---');
    const CONCURRENCY_LEVELS = [10, 50, 100];
    const TARGET_ENDPOINT = '/api/graviton/metrics'; // Most critical

    for (const level of CONCURRENCY_LEVELS) {
        console.log(`\nSimulating ${level} concurrent requests to ${TARGET_ENDPOINT}...`);
        const promises = [];
        const start = performance.now();
        for (let i = 0; i < level; i++) promises.push(fetchUrl(TARGET_ENDPOINT));

        const results = await Promise.all(promises);
        const end = performance.now();
        const totalTime = end - start;

        const success = results.filter(r => r.status === 200).length;
        const failures = results.filter(r => r.status !== 200).length;
        const avgResponse = results.reduce((acc, r) => acc + r.time, 0) / level;

        console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
        console.log(`Throughput: ${(level / (totalTime / 1000)).toFixed(2)} req/sec`);
        console.log(`Avg Request Time: ${avgResponse.toFixed(2)}ms`); // This is client-side perceived time per request
        console.log(`Success: ${success}, Failures: ${failures}`);

        if (failures > 0) {
            const err = results.find(r => r.status !== 200);
            console.log('🔴 Failure Reason (Sample):', err.error);
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { performance } = require('perf_hooks');

runBenchmark();
