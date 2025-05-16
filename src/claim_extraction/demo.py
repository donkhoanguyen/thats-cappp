from extractor import ClaimExtractor

# Create an instance of the ClaimExtractor class
extractor = ClaimExtractor()

# Example text to extract claims from
text = """
"Albert Einstein was a theoretical physicist who developed the theory of relativity."
"""

# Extract claims from the text
# Split the extracted claims into separate sentences
extracted_claims = extractor.extract(text)[0].replace('.\n', '. ').split('. ')

# Print the extracted claims
print("\nExtracted Claims:")
for i, claim in enumerate(extracted_claims, 1):
    print(f"{i}. {claim}\n")