// AI-assisted plugin. If the site redesigns, prefer rewriting this file
// over patching the generic card selectors in parseNovelCards().
// No complex regex is used intentionally.

import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class ReadNovelEuPlugin {
  id = 'readnovelEu';
  name = 'ReadNovelEU';
  icon = 'src/en/readnovelEu/icon.png';
  site = 'https://readnovel.eu';
  version = '1.0.0';

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
    },
  };

  async popularNovels(pageNo, { showLatestNovels, filters }) {
    const params = new URLSearchParams();
    params.set('page', String(pageNo));
    if (showLatestNovels) params.set('order_by', 'new');
    if (filters?.status?.value) params.set('status', String(filters.status.value));

    const body = await fetchText(`${this.site}/browse?${params.toString()}`);
    return this.parseNovelCards(loadCheerio(body));
  }

  async searchNovels(searchTerm, pageNo) {
    const params = new URLSearchParams();
    params.set('q', searchTerm);
    if (pageNo > 1) params.set('page', String(pageNo));

    const body = await fetchText(`${this.site}/search?${params.toString()}`);
    return this.parseNovelCards(loadCheerio(body));
  }

  async parseNovel(novelPath) {
    const body = await fetchText(this.site + novelPath);
    const $ = loadCheerio(body);

    return {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Unknown',
      cover: this.parseCover($),
      author: this.parseAuthor($),
      summary: $('#synopsis-text').text().trim(),
      genres: this.parseGenres($),
      status: this.parseStatus($),
      chapters: this.parseChapterList($),
      totalPages: this.parseTotalPages($),
    };
  }

  async parsePage(novelPath, page) {
    const body = await fetchText(`${this.site}${novelPath}?page=${page}`);
    const $ = loadCheerio(body);
    return { chapters: this.parseChapterList($) };
  }

  async parseChapter(chapterPath) {
    const body = await fetchText(this.site + chapterPath);
    const $ = loadCheerio(body);

    const content = $('div#chapter-content');
    content.find("aside[aria-label='Advertisement'], script, style").remove();

    return content.html() ?? '';
  }

  resolveUrl(path, _isNovel) {
    return path.startsWith('http') ? path : `${this.site}${path}`;
  }

  parseCover($) {
    const coverImg = $('img').filter((_, el) => /cover$/i.test($(el).attr('alt') || '')).first();
    return coverImg.attr('src') || $('div.w-28 img').first().attr('src') || defaultCover;
  }

  parseAuthor($) {
    let author = '';
    $('p').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (/^by\s+/i.test(text)) {
        author = $el.find('span').first().text().trim() || text.replace(/^by\s+/i, '');
        return false;
      }
    });
    return author;
  }

  parseGenres($) {
    const genres = new Set();
    $("a[href*='/genre/'], a[href*='/show_all/categories/']").each((_, el) => {
      const text = $(el).text().trim();
      if (text) genres.add(text);
    });
    return [...genres].join(', ');
  }

  parseStatus($) {
    const statusText = $('span, div')
      .filter((_, el) => /^(ongoing|completed|hiatus|dropped)$/i.test($(el).text().trim()))
      .first().text().trim().toLowerCase();

    switch (statusText) {
      case 'ongoing': return NovelStatus.Ongoing;
      case 'completed': return NovelStatus.Completed;
      case 'hiatus': return NovelStatus.OnHiatus;
      case 'dropped': return NovelStatus.Cancelled;
      default: return NovelStatus.Unknown;
    }
  }

  parseChapterList($) {
    const chapters = [];
    $('section#chapters ol li').each((_, li) => {
      const $li = $(li);
      const $a = $li.find("a[href*='/chapter/']").first();
      const path = $a.attr('href');
      if (!path) return;

      const $clone = $a.clone();
      const releaseTime = $clone.find('time').attr('datetime');
      $clone.find('time').remove();

      const name = $clone.text().replace(/\s+/g, ' ').trim();
      const numberFromPath = Number(path.match(/-(\d+)(?:[?#]|$)/)?.[1]);
      const chapterNumber = Number.isNaN(numberFromPath)
        ? parseInt($li.attr('data-n') || '', 10)
        : numberFromPath;

      chapters.push({
        name,
        path,
        chapterNumber: Number.isNaN(chapterNumber) ? undefined : chapterNumber,
        releaseTime,
      });
    });
    return chapters;
  }

  parseTotalPages($) {
    let total = 1;
    $("nav[aria-label='Chapter ranges'] a[href*='page=']").each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/[?&]page=(\d+)/);
      if (match) total = Math.max(total, Number(match[1]));
    });
    return total;
  }

  parseNovelCards($) {
    const found = new Map();
    $("a[href^='/novel/']").each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const path = href.split('?')[0].split('#')[0];
      if (found.has(path)) return;

      const $el = $(el);
      const card = $el.closest('article, li, div');
      const name = $el.find('h3, h2, [class*="font-display"]').first().text().trim()
        || card.find('h3, h2').first().text().trim()
        || $el.text().trim();
      if (!name) return;

      const cover = card.find('img').first().attr('src')
        || $el.find('img').first().attr('src')
        || defaultCover;

      found.set(path, { name, path, cover });
    });
    return [...found.values()];
  }
}

export default new ReadNovelEuPlugin();
