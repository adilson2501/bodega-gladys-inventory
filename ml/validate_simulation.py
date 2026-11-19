"""CLI explícita para validar una salida local de simulation-v1."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml.simulate_commercial import main


if __name__ == "__main__":
    sys.argv.append("--validate-only")
    main()
