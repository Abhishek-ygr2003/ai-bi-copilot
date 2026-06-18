/**
 * Python Code Interpreter Sandbox
 *
 * Runs Python code locally in a secure subprocess.
 * Includes security checks, execution timeout (15s),
 * and automatically captures generated matplotlib charts from the scratch/ folder.
 */

import { exec, execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface CodeInterpreterResult {
  stdout: string;
  stderr: string;
  success: boolean;
  error?: string;
  chartPath?: string;
}

/**
 * Validates Python code against basic security rules.
 */
export function validatePythonCode(code: string): { valid: boolean; reason?: string } {
  const blockedImports = [
    "os",
    "sys",
    "subprocess",
    "shutil",
    "socket",
    "urllib",
    "requests",
    "pty",
    "platform",
    "posix",
    "builtins",
    "importlib",
    "ctypes",
  ];

  // Matches: import os, import sys as s, from subprocess import ...
  const importRegex = new RegExp(
    `\\b(?:import|from)\\s+(${blockedImports.join("|")})\\b`,
    "i"
  );

  if (importRegex.test(code)) {
    const match = code.match(importRegex);
    return {
      valid: false,
      reason: `Security Violation: Importing module '${match ? match[1] : "unknown"}' is blocked in this local sandbox.`,
    };
  }

  // Check for eval and exec
  const evalExecRegex = /\b(eval|exec)\s*\(/i;
  if (evalExecRegex.test(code)) {
    return {
      valid: false,
      reason: "Security Violation: Using 'eval' or 'exec' functions is blocked in this local sandbox.",
    };
  }

  // Deep AST analysis in Python to prevent dynamic bypasses
  try {
    const scriptPath = path.join(process.cwd(), "src", "llm", "check_ast.py");
    const checkResult = execSync(`python "${scriptPath}"`, {
      input: code,
      encoding: "utf8",
      timeout: 3000
    });
    if (checkResult.trim() === "VALID") {
      return { valid: true };
    } else {
      return { valid: false, reason: checkResult.trim() };
    }
  } catch (err: any) {
    const reason = err.stdout ? String(err.stdout).trim() : (err.message || "AST validation failed.");
    return { valid: false, reason: `Security Violation: ${reason}` };
  }
}

/**
 * Executes python code inside the local sandbox directory scratch/
 */
export async function runPythonCode(
  code: string,
  datasetCsvPath: string
): Promise<CodeInterpreterResult> {
  // 1. Ensure scratch/ directory exists
  const scratchDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    await fs.promises.mkdir(scratchDir, { recursive: true });
  }

  // 2. Validate code first
  const validation = validatePythonCode(code);
  if (!validation.valid) {
    return {
      stdout: "",
      stderr: validation.reason || "Security validation failed.",
      success: false,
      error: "Security validation error",
    };
  }

  // 3. Generate a unique file identifier
  const scriptId = Math.random().toString(36).substring(2, 9);
  const scriptPath = path.join(scratchDir, `run_${scriptId}.py`);

  // Normalize absolute path for python compatibility on Windows
  const normalizedCsvPath = datasetCsvPath.replace(/\\/g, "/");

  // Matplotlib is configured to use 'Agg' (non-interactive file backend)
  // We also preset standard styling and configuration
  const wrappedCode = `
import pandas as pd
import numpy as np
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Apply Elegant Dark theme config to matplotlib
plt.style.use('dark_background')
matplotlib.rcParams['figure.facecolor'] = '#161618'
matplotlib.rcParams['axes.facecolor'] = '#161618'
matplotlib.rcParams['axes.edgecolor'] = '#1f2937'
matplotlib.rcParams['grid.color'] = '#1f2937'
matplotlib.rcParams['text.color'] = '#f3f4f6'
matplotlib.rcParams['axes.labelcolor'] = '#d1d5db'
matplotlib.rcParams['xtick.color'] = '#9ca3af'
matplotlib.rcParams['ytick.color'] = '#9ca3af'

# Unified color theme palette (Sky blue, emerald, amber, rose, cyan)
THEME_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f43f5e', '#22d3ee']

# Pre-defined DATASET_PATH points to active workspace CSV
DATASET_PATH = r"${normalizedCsvPath}"
df = pd.read_csv(DATASET_PATH)

# Execute script content
try:
${code.split("\n").map(line => `    ${line}`).join("\n")}
except Exception as e:
    import traceback
    print("PYTHON RUNTIME ERROR:", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    raise e
`;

  await fs.promises.writeFile(scriptPath, wrappedCode, "utf8");

  return new Promise((resolve) => {
    // 15 seconds execution limit, max buffer 10MB
    exec(
      `python "${scriptPath}"`,
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      async (err, stdout, stderr) => {
        // Cleanup temporary python script file
        try {
          if (fs.existsSync(scriptPath)) {
            await fs.promises.unlink(scriptPath);
          }
        } catch (cleanupErr) {
          console.warn(`[CodeInterpreter] Failed to clean up script ${scriptPath}:`, cleanupErr);
        }

        // Check if the script produced 'scratch/chart.png' (or saved it directly to the root/scratch folder)
        let chartPath: string | undefined = undefined;
        const defaultChartPath = path.join(scratchDir, "chart.png");

        if (fs.existsSync(defaultChartPath)) {
          const uniqueChartName = `chart_${scriptId}.png`;
          const uniqueChartPath = path.join(scratchDir, uniqueChartName);
          try {
            await fs.promises.rename(defaultChartPath, uniqueChartPath);
            chartPath = `/scratch/${uniqueChartName}`;
          } catch (renameErr) {
            console.error("[CodeInterpreter] Error renaming generated chart:", renameErr);
            chartPath = `/scratch/chart.png`;
          }
        }

        if (err) {
          const errMsg = err.killed
            ? "Execution timed out after 15 seconds."
            : err.message;
          resolve({
            stdout,
            stderr,
            success: false,
            error: errMsg,
            chartPath,
          });
        } else {
          resolve({
            stdout,
            stderr,
            success: true,
            chartPath,
          });
        }
      }
    );
  });
}
