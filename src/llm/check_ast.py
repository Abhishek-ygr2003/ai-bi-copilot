import ast
import sys

def main():
    try:
        code_to_check = sys.stdin.read()
    except Exception as e:
        print(f"Error reading input: {e}")
        sys.exit(3)

    blocked_modules = {
        'os', 'sys', 'subprocess', 'shutil', 'socket', 'urllib', 'requests', 
        'pty', 'platform', 'posix', 'importlib', 'ctypes'
    }
    blocked_functions = {'eval', 'exec', 'compile', '__import__'}
    blocked_attrs = {
        '__code__', '__globals__', '__builtins__', '__dict__', '__class__', 
        'func_globals', 'func_code'
    }

    try:
        tree = ast.parse(code_to_check)
        for node in ast.walk(tree):
            # 1. Imports check
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.name.split('.')[0]
                    if name in blocked_modules:
                        print(f"Security Violation: Import of module '{name}' is blocked.")
                        sys.exit(1)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    name = node.module.split('.')[0]
                    if name in blocked_modules:
                        print(f"Security Violation: Import from module '{name}' is blocked.")
                        sys.exit(1)
            
            # 2. Blocked function calls check
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in blocked_functions:
                    print(f"Security Violation: Call to blocked function '{node.func.id}' is blocked.")
                    sys.exit(1)
                
            # 3. Attribute traversal check (prevents object graph traversal)
            elif isinstance(node, ast.Attribute):
                if node.attr in blocked_attrs:
                    print(f"Security Violation: Access to blocked attribute '{node.attr}' is blocked.")
                    sys.exit(1)
                if isinstance(node.value, ast.Name) and node.value.id in blocked_modules:
                    print(f"Security Violation: Reference to blocked module '{node.value.id}' is blocked.")
                    sys.exit(1)
                    
        print("VALID")
        sys.exit(0)
    except SyntaxError as e:
        print(f"Syntax Error: {e.msg} at line {e.lineno}")
        sys.exit(2)
    except Exception as e:
        print(f"Validation Error: {str(e)}")
        sys.exit(3)

if __name__ == "__main__":
    main()
