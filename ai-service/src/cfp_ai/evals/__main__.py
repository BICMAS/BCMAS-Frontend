from __future__ import annotations

import argparse
import sys
from pathlib import Path

from cfp_ai.evals.runner import DATASETS, render, run_all


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the CFP AI offline evaluation suites.")
    parser.add_argument("--datasets", type=Path, default=DATASETS, help="folder with *.jsonl datasets")
    args = parser.parse_args()
    results = run_all(args.datasets)
    print(render(results))
    return 0 if all(r.passed for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
