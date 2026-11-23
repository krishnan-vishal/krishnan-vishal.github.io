"""Stage the owner brief as private Payload editorial review records."""
import argparse
import hashlib
import json
import os
import re
import unicodedata
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree
from zipfile import ZipFile


def extract(path):
    with ZipFile(path) as document:
        root = ElementTree.fromstring(document.read("word/document.xml"))
    paragraphs = [
        "".join(node.text or "" for node in paragraph.findall(".//{*}t"))
        for paragraph in root.findall("./{*}body/{*}p")
    ]
    profiles = []
    for index, line in enumerate(paragraphs):
        match = re.fullmatch(r"(\d{2})  (.+)", line)
        if not match:
            continue
        number, name = match.groups()
        fields = paragraphs[index + 1:index + 7]
        bio = re.fullmatch(r"Primary public landing page: (.+) — (https://\S+)", fields[4])
        if not bio or not fields[1].startswith("Career:") or not fields[3].startswith("Contribution:"):
            raise ValueError(f"Unexpected candidate structure at #{number}")
        if int(number) != len(profiles) + 1:
            raise ValueError("Candidate order or number changed")
        normalized = unicodedata.normalize("NFKC", name).casefold()
        key = "gpir-expert:" + hashlib.sha256(normalized.encode()).hexdigest()[:32]
        profiles.append({
            "sourceRecordKey": key,
            "sourceValidationSummary": "Owner brief candidate. Independent evidence and publication clearance pending.",
            "sourcePayload": {
                "id": key, "name": name, "kind": "gpir-domain-expert", "state": "REVIEW",
                "officialBio": {"url": bio[2], "label": bio[1]},
                "brief": {"coverage": fields[0], "career": fields[1], "credentials": fields[2],
                          "contribution": fields[3], "outstanding": fields[5]},
            },
        })
    if len(profiles) != 13 or len({record["sourceRecordKey"] for record in profiles}) != 13:
        raise ValueError("Expected the 13 distinct candidate identities from the owner brief")
    return profiles


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def stage(records):
    base = os.environ["PAYLOAD_PUBLIC_SERVER_URL"].rstrip("/")
    token = os.environ["GPIR_PAYLOAD_EDITOR_TOKEN"]
    url = urlparse(base)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
        raise ValueError("Use the approved HTTPS Payload deployment origin")
    client = build_opener(NoRedirect)
    headers = {"Authorization": "JWT " + token, "Content-Type": "application/json"}
    endpoint = base + "/api/editorial-metadata"

    def exists(key):
        query = urlencode({"where[sourceRecordKey][equals]": key, "limit": 1, "depth": 0})
        with client.open(Request(endpoint + "?" + query, headers=headers), timeout=20) as response:
            return any(row.get("sourceRecordKey") == key for row in json.load(response)["docs"])

    created = 0
    for record in records:
        key = record["sourceRecordKey"]
        if exists(key):
            continue
        try:
            request = Request(endpoint, data=json.dumps(record).encode(), headers=headers, method="POST")
            with client.open(request, timeout=20):
                created += 1
        except HTTPError as error:
            if error.code not in (400, 409) or not exists(key):
                raise
    print(f"Created {created} REVIEW records. Confirmed {len(records) - created} existing identities.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("brief")
    parser.add_argument("--stage", action="store_true", help="Write REVIEW records to the configured Payload deployment")
    args = parser.parse_args()
    try:
        records = extract(args.brief)
        if args.stage:
            stage(records)
        else:
            print(f"Validated {len(records)} distinct candidate records for editorial review.")
    except HTTPError as error:
        parser.exit(1, f"Payload returned HTTP {error.code}. Run again after resolving the issue to resume.\n")
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Review staging failed ({type(error).__name__}). Check the brief and Payload configuration.\n")
