from playwright.async_api import async_playwright
import asyncio

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Capture network requests
        page.on("request", lambda request: print(f"Request: {request.url}"))
        
        await page.goto("https://rcard.re.kr/detail/KP-poCLmBpMZbYojNK_sjw")
        # Wait for content to load
        await page.wait_for_selector('h2', timeout=10000) # Assuming name is in h2 or similar
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
