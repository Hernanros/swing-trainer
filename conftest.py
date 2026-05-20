import sys
from pathlib import Path

# This file marks the project root for pytest
# Ensure root directory is in sys.path for imports
root_dir = Path(__file__).parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
