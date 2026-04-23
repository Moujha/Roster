"""
Entry point for the daily data pipeline.
Run: python run.py
"""
from db import get_client


def main() -> None:
    client = get_client()
    print("Connected to Supabase.")

    response = client.table("artists").select("id, name").limit(5).execute()
    print(f"Sample artists: {response.data}")


if __name__ == "__main__":
    main()
