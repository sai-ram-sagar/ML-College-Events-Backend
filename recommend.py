import os
import json
import sqlite3
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load events data from JSON
def get_events():
    try:
        with open("events.json", "r", encoding="utf-8") as file:
            events = json.load(file)
        return events if events else []
    except Exception as e:
        print(json.dumps({"error": f"Error loading events.json: {str(e)}"}))
        return []

# Fetch user search history from SQLite database
def get_user_history(user_id):
    try:
        conn = sqlite3.connect("events.db")
        cursor = conn.cursor()
        cursor.execute("SELECT search_query FROM search_history WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [row[0].lower() for row in rows] if rows else []
    except Exception as e:
        print(json.dumps({"error": f"Database error: {str(e)}"}))
        return []

# Compute TF-IDF vectorization and recommend events based on cosine similarity
def recommend_events(user_id, top_n=4):
    user_history = get_user_history(user_id)
    all_events = get_events()

    if not all_events:
        return {"error": "No events available"}

    if not user_history:
        return {"message": "No search history found for this user", "recommendations": []}

    event_names = [event["event_name"].lower() for event in all_events]
    
    # Combine user history queries into a single string
    user_search_text = " ".join(user_history)

    # TF-IDF Vectorization
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform([user_search_text] + event_names)

    # Compute cosine similarity (user query vs. all events)
    user_vector = tfidf_matrix[0]  # User history vector
    event_vectors = tfidf_matrix[1:]  # Event vectors

    similarities = cosine_similarity(user_vector, event_vectors).flatten()

    # Get top N most similar events
    top_indices = similarities.argsort()[-top_n:][::-1]  # Sort in descending order
    recommended_events = [all_events[i] for i in top_indices]

    return {"recommendations": recommended_events}

# Run script from terminal
if __name__ == "__main__":
    import sys
    try:
        user_id = int(sys.argv[1])
        recommendations = recommend_events(user_id)
        print(json.dumps(recommendations, indent=2))
    except Exception as e:
        print(json.dumps({"error": f"Unexpected error: {str(e)}"}))
