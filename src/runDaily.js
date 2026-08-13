// Entry point for the scheduled daily run (Windows Task Scheduler calls
// this directly — see docs for setup). Wraps pullAll.js, capturing all its
// output into a per-day log file and appending one line to a running
// summary log, so past runs can be checked at a glance without opening
// each day's full log individually.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { todayDateFolder } = require('./dateFolder');

const ROOT = path.join(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'logs');
const DATE = todayDateFolder();
const LOG_FILE = path.join(LOGS_DIR, `${DATE}.log`);
const SUMMARY_FILE = path.join(LOGS_DIR, 'summary.log');

function nowTimestamp() {
  // Wall-clock time for log lines — informational only, not used for any
  // date-folder/filename logic (that all goes through dateFolder.js).
  return new Date().toISOString();
}

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
logStream.write(`\n=== Run started ${nowTimestamp()} ===\n`);

const child = spawn(process.execPath, [path.join(ROOT, 'src', 'pullAll.js')], {
  cwd: ROOT,
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on('close', (code) => {
  const status = code === 0 ? 'SUCCESS' : `FAILED (exit code ${code})`;
  const summaryLine = `${DATE}\t${nowTimestamp()}\t${status}\n`;

  logStream.write(`=== Run finished ${nowTimestamp()}: ${status} ===\n`);
  logStream.end();
  fs.appendFileSync(SUMMARY_FILE, summaryLine);

  console.log(`\n${status} — full log: logs/${DATE}.log, summary: logs/summary.log`);
  process.exit(code === 0 ? 0 : 1);
});
