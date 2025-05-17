from gpt_extractor import ClaimExtractor

def main():
    # Initialize the claim extractor
    extractor = ClaimExtractor()  # Will use OPENAI_API_KEY from environment
    
    # # Example text to extract claims from
    # sample_text = """
    # The new study shows that regular exercise improves cognitive function. 
    # Participants who exercised 3 times per week showed better memory retention.
    # Additionally, the research found that a balanced diet enhanced the benefits of exercise.
    # """
    
    # # Extract claims from single text
    # claims = extractor.extract_claims(sample_text)
    # print("\nExtracted claims from single text:")
    # for claim in claims:
    #     print(f"- {claim}")
        
    # Example with multiple texts
    multiple_texts = [
        "Mid-Night tonight, I would say. And China charges American rice farmers and over-quoted, it's called, a tariff rate of 65 percent, South Korea charges 50. Actually, they charge different from 50 percent to 513 percent in Japan. Our friend charges a 700 percent, but that's because they don't want a selling rice another thing who can blame.",
    ]
    
    # Extract claims from multiple texts
    batch_claims = extractor.batch_extract_claims(multiple_texts)
    print("\nExtracted claims from multiple texts:")
    for i, text_claims in enumerate(batch_claims):
        print(f"\nText {i+1}:")
        for claim in text_claims:
            print(f"- {claim}")

if __name__ == "__main__":
    main()
