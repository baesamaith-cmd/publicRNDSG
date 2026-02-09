from playwright.async_api import async_playwright
import asyncio
import json

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Capture all requests
        requests = []
        page.on("request", lambda request: requests.append(request.url))
        
        await page.goto("https://rcard.re.kr/detail/KP-poCLmBpMZbYojNK_sjw")
        
        # Wait for API requests to fire
        try:
            await page.wait_for_request(lambda req: "api-v2.rcard.re.kr" in req.url, timeout=10000)
            await page.wait_for_timeout(3000) # Wait a bit more for rendering
        except:
            print("Timeout waiting for API")

        # Check if we can find the API call that uses the slug
        print("--- API Calls ---")
        for req in requests:
            if "api-v2" in req:
                print(f"API: {req}")

        # Check if the ID 10520 is in the page content
        content = await page.content()
        if "10520" in content:
            print("\n--- Content Found ---")
            idx = content.find("10520")
            # print start and end to avoid huge dump
            start = max(0, idx - 100)
            end = min(len(content), idx + 100)
            print(f"Context: ...{content[start:end]}...")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
