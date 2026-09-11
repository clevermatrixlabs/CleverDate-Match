"""Small local DeepFace bridge used by the Node verification endpoint.

The process is deliberately a one-shot CLI: Node sends two base64 images on
stdin and receives one JSON result on stdout. DeepFace model/log output is
redirected to stderr so the protocol stays machine-readable.
"""

import base64
import contextlib
import json
import os
import sys
import tempfile


def compare(payload: dict) -> dict:
    from deepface import DeepFace

    with tempfile.TemporaryDirectory(prefix="clever-date-deepface-") as directory:
        first = os.path.join(directory, "selfie.jpg")
        second = os.path.join(directory, "profile.jpg")
        with open(first, "wb") as handle:
            handle.write(base64.b64decode(payload["image1Base64"]))
        with open(second, "wb") as handle:
            handle.write(base64.b64decode(payload["image2Base64"]))

        with contextlib.redirect_stdout(sys.stderr):
            result = DeepFace.verify(
                img1_path=first,
                img2_path=second,
                model_name="ArcFace",
                detector_backend="opencv",
                enforce_detection=True,
                align=True,
            )

        return {
            "verified": bool(result.get("verified")),
            "distance": float(result.get("distance", 1.0)),
            "threshold": float(result.get("threshold", 0.0)),
        }


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != "compare":
        raise SystemExit("Usage: python main.py compare")
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(compare(payload)), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise


if __name__ == "__main__":
    main()
