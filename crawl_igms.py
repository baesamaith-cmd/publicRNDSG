"""
Singapore Research Grant (IGMS) Awarded Projects Crawler
- Final version with all bug fixes applied
- Uses Playwright for browser automation
- Parallel processing for speed
- Saves data to Excel (.xlsx) format

Usage:
    python crawl_igms.py

Requirements:
    pip install playwright pandas openpyxl
    playwright install chromium
"""

import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright
import pandas as pd
from typing import List, Dict

# Configuration
CONCURRENT_DETAIL_FETCHES = 5  # Number of parallel detail page fetches
SAVE_INTERVAL = 50  # Save backup every N projects


def clean_text(text):
    """Remove illegal characters for Excel"""
    if pd.isna(text):
        return text
    # Remove control characters (except newline, tab)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(text))
    return text


async def get_project_detail(context, url: str) -> dict:
    """Fetch detailed information from project detail page"""
    detail = {
        'Abstract': '',
        'Keywords': '',
        'Duration': '',
    }

    page = None
    try:
        page = await context.new_page()
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(1500)

        body_text = await page.locator('body').text_content()

        if body_text:
            # Replace non-breaking space with regular space
            body_text = body_text.replace('\xa0', ' ')

            # Abstract extraction - handle lots of whitespace/newlines
            abstract_match = re.search(
                r'Abstract[:\s]+([\s\S]{50,10000}?)(?=\s*Keywords?[:\s]|\s*Project\s*Duration|\s*Keyword\s*:|\s*Start\s*Date|Co-Investigators|Team Members)',
                body_text, re.IGNORECASE
            )
            if abstract_match:
                abstract_text = abstract_match.group(1).strip()
                abstract_text = re.sub(r'\s+', ' ', abstract_text)
                if len(abstract_text) > 50:
                    detail['Abstract'] = clean_text(abstract_text[:3000])

            # Keywords extraction
            keywords_match = re.search(r'Keywords?[:\s]*\n*([^\n]{10,500})', body_text, re.IGNORECASE)
            if keywords_match:
                keywords = keywords_match.group(1).strip()
                keywords = re.sub(r'\s+', ' ', keywords)
                if not keywords.lower().startswith('project') and len(keywords) > 5:
                    detail['Keywords'] = clean_text(keywords)

            # Duration extraction
            duration_match = re.search(r'Project\s*Duration[:\s]*(\d+)\s*(?:months?)?', body_text, re.IGNORECASE)
            if duration_match:
                detail['Duration'] = duration_match.group(1) + ' months'
            else:
                duration_match2 = re.search(r'Duration[:\s]*(\d+)\s*(?:months?)?', body_text, re.IGNORECASE)
                if duration_match2:
                    detail['Duration'] = duration_match2.group(1) + ' months'

    except Exception as e:
        pass
    finally:
        if page:
            await page.close()

    return detail


async def fetch_details_batch(context, projects: List[Dict], start_idx: int) -> List[Dict]:
    """Fetch details for a batch of projects concurrently"""
    tasks = []
    for i, project in enumerate(projects):
        if project.get('Detail URL'):
            tasks.append(get_project_detail(context, project['Detail URL']))
        else:
            # Return empty dict for projects without URL
            async def empty_detail():
                return {'Abstract': '', 'Keywords': '', 'Duration': ''}
            tasks.append(empty_detail())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        if isinstance(result, dict):
            projects[i].update(result)

    return projects


async def crawl_awarded_projects(start_page: int = 1, end_page: int = None, fetch_details: bool = True):
    """
    Crawl awarded projects from researchgrant.gov.sg

    Args:
        start_page: Starting page number (default: 1)
        end_page: Ending page number (default: None = all pages)
        fetch_details: Whether to fetch detail pages (default: True)
    """

    all_projects = []

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)

        # Main context for list pages
        main_context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        # Separate context for detail pages
        detail_context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ) if fetch_details else None

        list_page = await main_context.new_page()

        print("브라우저 시작...")

        # Navigate to the page
        url = "https://www.researchgrant.gov.sg/Pages/Awarded_Projects.aspx"
        await list_page.goto(url, wait_until='networkidle', timeout=60000)
        print(f"페이지 로드 완료: {url}")

        # Wait for initial content to load
        await list_page.wait_for_timeout(3000)

        # Wait for the table to load
        try:
            await list_page.wait_for_selector('#grdAXPostAwardList tbody tr.content', timeout=30000)
        except:
            print("테이블 로딩 대기 중...")
            await list_page.wait_for_timeout(5000)

        # Get total records from the page
        total_records = 0
        total_pages = 1
        try:
            record_info = await list_page.locator('#PostAwardrecordFormat').text_content()
            if record_info:
                match = re.search(r'of\s+(\d+)', record_info)
                if match:
                    total_records = int(match.group(1))
                    total_pages = (total_records + 5 - 1) // 5
                    print(f"총 레코드 수: {total_records}, 총 페이지 수: {total_pages}")
        except Exception as e:
            print(f"총 레코드 수 확인 실패: {e}")

        if end_page is None:
            end_page = total_pages if total_records > 0 else 10000

        current_page = start_page

        # Navigate to start page if not page 1
        if start_page > 1:
            print(f"페이지 {start_page}로 이동 중...")
            try:
                await list_page.evaluate(f'GetPostAwardGrantCallData("StartDate", "desc", {start_page})')
                await list_page.wait_for_timeout(3000)
            except Exception as e:
                print(f"페이지 이동 실패: {e}")

        consecutive_empty = 0
        max_consecutive_empty = 3
        start_time = datetime.now()

        while current_page <= end_page:
            elapsed = (datetime.now() - start_time).total_seconds()
            if len(all_projects) > 0:
                rate = len(all_projects) / elapsed * 60
                remaining = (total_records - len(all_projects)) / rate if rate > 0 else 0
                print(f"\n페이지 {current_page}/{end_page} | {len(all_projects)}/{total_records} 완료 | {rate:.1f}/분 | 남은 시간: {remaining:.0f}분")
            else:
                print(f"\n페이지 {current_page}/{end_page} 크롤링 중...")

            # Wait for table to be ready
            await list_page.wait_for_timeout(500)

            # Extract data from current page
            rows = list_page.locator('#grdAXPostAwardList tbody tr.content')
            row_count = await rows.count()

            data_rows = row_count - 1 if row_count > 1 else 0

            if data_rows == 0:
                consecutive_empty += 1
                print(f"  데이터 없음 (연속 {consecutive_empty}회)")
                if consecutive_empty >= max_consecutive_empty:
                    print("연속으로 빈 페이지 발생. 크롤링 종료.")
                    break
                current_page += 1
                continue
            else:
                consecutive_empty = 0

            page_projects = []

            for i in range(1, row_count):
                try:
                    row = rows.nth(i)
                    cells = row.locator('td')
                    cell_count = await cells.count()

                    project_data = {
                        'Project ID': '',
                        'Project Title': '',
                        'Status': '',
                        'PI Name': '',
                        'Host Institution': '',
                        'Start Date': '',
                        'Detail URL': '',
                        'Abstract': '',
                        'Keywords': '',
                        'Duration': '',
                    }

                    if cell_count >= 5:
                        # Project ID
                        id_cell = cells.nth(0)
                        id_link = id_cell.locator('a')
                        if await id_link.count() > 0:
                            project_data['Project ID'] = (await id_link.text_content() or '').strip()
                            href = await id_link.get_attribute('href')
                            if href:
                                if href.startswith('/'):
                                    project_data['Detail URL'] = f"https://www.researchgrant.gov.sg{href}"
                                else:
                                    project_data['Detail URL'] = href

                        # Project Title
                        title_cell = cells.nth(1)
                        title_link = title_cell.locator('a')
                        if await title_link.count() > 0:
                            project_data['Project Title'] = (await title_link.text_content() or '').strip()
                        else:
                            project_data['Project Title'] = (await title_cell.text_content() or '').strip()

                        # Status
                        status_span = cells.nth(2).locator('span')
                        if await status_span.count() > 0:
                            project_data['Status'] = (await status_span.text_content() or '').strip()
                        else:
                            project_data['Status'] = (await cells.nth(2).text_content() or '').strip()

                        # PI Name
                        pi_span = cells.nth(3).locator('span')
                        if await pi_span.count() > 0:
                            project_data['PI Name'] = (await pi_span.text_content() or '').strip()
                        else:
                            project_data['PI Name'] = (await cells.nth(3).text_content() or '').strip()

                        # Host Institution
                        hi_span = cells.nth(4).locator('span')
                        if await hi_span.count() > 0:
                            project_data['Host Institution'] = (await hi_span.text_content() or '').strip()
                        else:
                            project_data['Host Institution'] = (await cells.nth(4).text_content() or '').strip()

                        # Start Date
                        if cell_count > 5:
                            date_span = cells.nth(5).locator('span')
                            if await date_span.count() > 0:
                                project_data['Start Date'] = (await date_span.text_content() or '').strip()
                            else:
                                project_data['Start Date'] = (await cells.nth(5).text_content() or '').strip()

                    if project_data['Project Title']:
                        page_projects.append(project_data)

                except Exception as e:
                    continue

            # Fetch details in parallel batches
            if fetch_details and page_projects:
                print(f"  목록 {len(page_projects)}개 수집, 상세 페이지 병렬 수집 중...")
                for batch_start in range(0, len(page_projects), CONCURRENT_DETAIL_FETCHES):
                    batch = page_projects[batch_start:batch_start + CONCURRENT_DETAIL_FETCHES]
                    await fetch_details_batch(detail_context, batch, len(all_projects) + batch_start)
            else:
                print(f"  {len(page_projects)}개 프로젝트 추출")

            all_projects.extend(page_projects)
            print(f"  총 {len(all_projects)}개 완료")

            # Save intermediate results
            if len(all_projects) % SAVE_INTERVAL == 0 and len(all_projects) > 0:
                save_to_excel(all_projects, 'awarded_projects_backup.xlsx')
                print(f"  [백업 저장: {len(all_projects)}개]")

            # Go to next page
            current_page += 1
            if current_page <= end_page:
                try:
                    await list_page.evaluate(f'GetPostAwardGrantCallData("StartDate", "desc", {current_page})')
                    await list_page.wait_for_timeout(1500)
                except Exception as e:
                    print(f"다음 페이지 이동 실패: {e}")
                    break

        await browser.close()

    return all_projects


def save_to_excel(projects: list, filename: str = None):
    """Save projects to Excel file"""
    if not filename:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'awarded_projects_{timestamp}.xlsx'

    if not projects:
        print("저장할 데이터가 없습니다.")
        return None

    df = pd.DataFrame(projects)

    # Clean all text columns
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].apply(clean_text)

    # Reorder columns
    columns = [
        'Project ID', 'Project Title', 'Status', 'PI Name',
        'Host Institution', 'Start Date', 'Duration',
        'Abstract', 'Keywords', 'Detail URL'
    ]
    columns = [c for c in columns if c in df.columns]
    df = df[columns]

    # Save to Excel
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Awarded Projects')

        worksheet = writer.sheets['Awarded Projects']
        from openpyxl.utils import get_column_letter
        for idx, col in enumerate(df.columns):
            try:
                max_length = min(max(df[col].astype(str).apply(len).max(), len(col)) + 2, 80)
            except:
                max_length = 20
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = max_length

    print(f"\n저장 완료: {filename}")
    print(f"총 {len(projects)}개 프로젝트 저장됨")

    return filename


async def main():
    """Main function"""
    print("=" * 60)
    print("Singapore Research Grant - Awarded Projects Crawler")
    print("=" * 60)

    start_time = datetime.now()

    projects = await crawl_awarded_projects(
        start_page=1,
        end_page=None,  # None = crawl all pages
        fetch_details=True
    )

    if projects:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        save_to_excel(projects, f'awarded_projects_{timestamp}.xlsx')

    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"\n총 소요 시간: {elapsed/60:.1f}분")


if __name__ == "__main__":
    asyncio.run(main())
