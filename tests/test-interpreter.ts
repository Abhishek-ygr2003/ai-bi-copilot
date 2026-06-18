import assert from "assert";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { validatePythonCode, runPythonCode } from "../src/llm/code-interpreter";

dotenv.config();

const COLOR = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  process.stdout.write(`  ${COLOR.cyan}Testing:${COLOR.reset} ${name}... `);
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`${COLOR.green}✓ PASS${COLOR.reset} ${COLOR.gray}(${duration}ms)${COLOR.reset}`);
  } catch (err: any) {
    console.log(`${COLOR.red}✗ FAIL${COLOR.reset}`);
    console.error(`\n  ${COLOR.red}${COLOR.bright}Error in test "${name}":${COLOR.reset}`);
    console.error(`  ${err.message || err}`);
    if (err.stack) {
      console.error(`  ${COLOR.gray}${err.stack.split("\n").slice(1, 4).join("\n")}${COLOR.reset}`);
    }
    console.error("");
    process.exit(1);
  }
}

async function main() {
  console.log(`\n${COLOR.magenta}${COLOR.bright}====================================================${COLOR.reset}`);
  console.log(`${COLOR.magenta}${COLOR.bright}  AI BI Copilot — Python Code Interpreter Tests${COLOR.reset}`);
  console.log(`${COLOR.magenta}${COLOR.bright}====================================================${COLOR.reset}\n`);

  const scratchDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const testCsvPath = path.join(scratchDir, "test_dataset.csv");
  const testCsvData = "Category,Sales,Profit\nFurniture,15000,320\nOffice Supplies,12000,150\nTechnology,22000,800\n";
  fs.writeFileSync(testCsvPath, testCsvData, "utf8");

  // 1. Security Validation Test - Blocked Imports
  await runTest("validatePythonCode — Blocks Blocked Imports", async () => {
    const maliciousCode1 = "import os\nos.system('echo dangerous')";
    const validation1 = validatePythonCode(maliciousCode1);
    assert.strictEqual(validation1.valid, false);
    assert.ok(validation1.reason?.includes("Security Violation"));

    const maliciousCode2 = "from subprocess import Popen";
    const validation2 = validatePythonCode(maliciousCode2);
    assert.strictEqual(validation2.valid, false);
    assert.ok(validation2.reason?.includes("Security Violation"));
  });

  // 2. Security Validation Test - Eval/Exec Blocks
  await runTest("validatePythonCode — Blocks Eval and Exec", async () => {
    const maliciousCode1 = "eval('2 + 2')";
    const validation1 = validatePythonCode(maliciousCode1);
    assert.strictEqual(validation1.valid, false);
    assert.ok(validation1.reason?.includes("eval"));

    const maliciousCode2 = "exec('x = 5')";
    const validation2 = validatePythonCode(maliciousCode2);
    assert.strictEqual(validation2.valid, false);
    assert.ok(validation2.reason?.includes("exec"));
  });

  // 3. Execution Test - Standard output
  await runTest("runPythonCode — Executes Basic Math", async () => {
    const code = `
total_sales = df['Sales'].sum()
print(f"Total Sales: {total_sales}")
`;
    const result = await runPythonCode(code, testCsvPath);
    assert.strictEqual(result.success, true);
    assert.ok(result.stdout.includes("Total Sales: 49000"));
  });

  // 4. Execution Test - Matplotlib Plot Generation
  await runTest("runPythonCode — Generates and Renames Plots", async () => {
    const code = `
fig, ax = plt.subplots()
ax.bar(df['Category'], df['Sales'], color=THEME_COLORS[0])
plt.title("Sales by Category")
plt.savefig('scratch/chart.png')
`;
    const result = await runPythonCode(code, testCsvPath);
    assert.strictEqual(result.success, true);
    assert.ok(result.chartPath, "Expected a chart path in the result");
    assert.ok(result.chartPath.startsWith("/scratch/chart_"), `Expected unique chart path, got ${result.chartPath}`);

    const absoluteChartPath = path.join(process.cwd(), result.chartPath.replace(/^\//, ""));
    assert.ok(fs.existsSync(absoluteChartPath), `Expected plot image file to exist at ${absoluteChartPath}`);

    // Cleanup generated plot file
    fs.unlinkSync(absoluteChartPath);
  });

  // 5. Execution Test - Security validation run blocking
  await runTest("runPythonCode — Blocks execution on dangerous script runs", async () => {
    const dangerousCode = "import socket\ns = socket.socket()";
    const result = await runPythonCode(dangerousCode, testCsvPath);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "Security validation error");
    assert.ok(result.stderr.includes("Security Violation"));
  });

  // Clean up test dataset
  fs.unlinkSync(testCsvPath);

  console.log(`\n${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright}    SUCCESS: All interpreter tests verified!${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
