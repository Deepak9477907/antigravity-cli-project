import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Memory cache for release notes
cache = {
    "data": None,
    "last_updated": None
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# Helper function to clean text for Twitter preview
def clean_for_tweet(html_content):
    if not html_content:
        return ""
    soup = BeautifulSoup(html_content, "html.parser")
    
    # Replace links with text + href optionally, or just get plain text
    text = soup.get_text()
    
    # Normalize whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def fetch_and_parse_feed():
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        releases = []
        item_counter = 0
        
        for entry in root.findall('atom:entry', ns):
            title = entry.find('atom:title', ns).text  # e.g., "June 15, 2026"
            updated = entry.find('atom:updated', ns).text  # e.g., "2026-06-15T00:00:00-07:00"
            
            link_elem = entry.find('atom:link', ns)
            link = link_elem.attrib.get('href', '') if link_elem is not None else ''
            
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ""
            
            if not content_html:
                continue
                
            # Parse sections using BeautifulSoup
            soup = BeautifulSoup(content_html, 'html.parser')
            
            current_type = None
            current_html_parts = []
            
            # Helper to add parsed item
            def add_item(q_type, parts):
                nonlocal item_counter
                html_str = "".join(str(c) for c in parts).strip()
                if not html_str:
                    return
                
                clean_text = clean_for_tweet(html_str)
                releases.append({
                    "id": f"bq_release_{item_counter}",
                    "date": title,
                    "type": q_type or "General",
                    "content_html": html_str,
                    "content_text": clean_text,
                    "link": link,
                    "timestamp": updated
                })
                item_counter += 1

            for child in soup.contents:
                if child.name == 'h3':
                    if current_type is not None:
                        add_item(current_type, current_html_parts)
                    current_type = child.get_text().strip()
                    current_html_parts = []
                else:
                    if current_type is not None or str(child).strip():
                        current_html_parts.append(child)
            
            if current_type is not None:
                add_item(current_type, current_html_parts)
                
        # Sort by timestamp descending
        releases.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        return {
            "status": "success",
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "releases": releases
        }
    except Exception as e:
        print(f"Error fetching feed: {str(e)}")
        # Return fallback mock data if we hit connection issues (e.g. offline dev)
        # so the app is always beautiful and fully functional
        return get_fallback_data(str(e))

def get_fallback_data(error_msg):
    # High fidelity offline data to guarantee app functions
    mock_releases = [
        {
            "id": "bq_release_fallback_0",
            "date": datetime.now().strftime("%B %d, %Y"),
            "type": "Feature",
            "content_html": "<p>BigQuery Release Notes dashboard has loaded in offline/fallback mode. Error details: <code>" + error_msg + "</code>. You can click 'Refresh' to retry connecting to the Google Cloud Feed.</p>",
            "content_text": "BigQuery Release Notes dashboard loaded in offline/fallback mode. Refresh to retry connection.",
            "link": "https://docs.cloud.google.com/bigquery/docs/release-notes",
            "timestamp": datetime.now().isoformat()
        },
        {
            "id": "bq_release_fallback_1",
            "date": "June 15, 2026",
            "type": "Feature",
            "content_html": "<p>Use Gemini Cloud Assist to analyze your SQL queries and receive recommendations to <a href=\"https://docs.cloud.google.com/bigquery/docs/use-cloud-assist#optimize-query\">optimize query performance in BigQuery</a>. This feature is available to customers who use BigQuery editions. This feature is in Preview.</p>",
            "content_text": "Use Gemini Cloud Assist to analyze your SQL queries and receive recommendations to optimize query performance in BigQuery.",
            "link": "https://docs.cloud.google.com/bigquery/docs/release-notes#June_15_2026",
            "timestamp": "2026-06-15T00:00:00-07:00"
        },
        {
            "id": "bq_release_fallback_2",
            "date": "June 15, 2026",
            "type": "Issue",
            "content_html": "<p>Support for configuring daily token quotas for BigQuery generative AI functions has been temporarily disabled. We are working to restore this feature as soon as possible.</p>",
            "content_text": "Support for configuring daily token quotas for BigQuery generative AI functions has been temporarily disabled.",
            "link": "https://docs.cloud.google.com/bigquery/docs/release-notes#June_15_2026",
            "timestamp": "2026-06-15T00:00:00-07:00"
        },
        {
            "id": "bq_release_fallback_3",
            "date": "June 12, 2026",
            "type": "Feature",
            "content_html": "<p><a href=\"https://docs.cloud.google.com/bigquery/docs/generative-ai-overview\">BigQuery AI functions</a> can use <a href=\"https://docs.cloud.google.com/bigquery/docs/work-with-objectref\"><code>ObjectRef</code> values</a> directly as input, without calling the <code>OBJ.GET_ACCESS_URL</code> function. This feature is generally available (GA).</p>",
            "content_text": "BigQuery AI functions can use ObjectRef values directly as input, without calling the OBJ.GET_ACCESS_URL function.",
            "link": "https://docs.cloud.google.com/bigquery/docs/release-notes#June_12_2026",
            "timestamp": "2026-06-12T00:00:00-07:00"
        }
    ]
    return {
        "status": "fallback",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "releases": mock_releases,
        "error": error_msg
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def api_releases():
    force_refresh = request.args.get("refresh", "false").lower() == "true"
    
    if force_refresh or cache["data"] is None:
        feed_data = fetch_and_parse_feed()
        cache["data"] = feed_data
        cache["last_updated"] = datetime.now()
    
    return jsonify(cache["data"])

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
