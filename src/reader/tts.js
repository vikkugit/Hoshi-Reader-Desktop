//
//  tts.js
//  Hoshi Reader
//
//  Frame side of text-to-speech. It only deals with the document: it splits
//  the visible text into sentences, highlights the sentence being read and
//  scrolls it into view. The audio itself is produced by the host window.
//
//  SPDX-License-Identifier: GPL-3.0-or-later
//

window.hoshiTts = {
    sentences: [],
    index: -1,
    hooks: null,
    styled: false,

    init(hooks) {
        this.hooks = hooks;
        if (this.styled) {
            return;
        }
        this.styled = true;
        const style = document.createElement('style');
        style.textContent = '::highlight(hoshi-tts) { background-color: rgba(255, 170, 60, 0.4) !important; color: inherit; }';
        document.head.appendChild(style);
    },

    command(cmd, options) {
        switch (cmd) {
            case 'start':
                this.sentences = this.collect();
                this.index = this.firstVisible();
                this.emit();
                break;
            case 'current':
                if (this.index < 0) {
                    this.hooks.post({ hoshi: 'tts-end' });
                    break;
                }
                this.emit();
                break;
            case 'next':
                this.index += 1;
                this.emit();
                break;
            case 'prev':
                this.index = Math.max(0, this.index - 1);
                this.emit();
                break;
            case 'stop':
                this.clear();
                break;
        }
    },

    clear() {
        CSS.highlights.delete('hoshi-tts');
        this.sentences = [];
        this.index = -1;
    },

    sentenceRanges(sentence) {
        return sentence.segments.map(segment => {
            const range = document.createRange();
            range.setStart(segment.node, segment.start);
            range.setEnd(segment.node, segment.end);
            return range;
        });
    },

    // Wrapping of highlights or cues replaces text nodes, so re-collect when stale.
    refresh() {
        const sentence = this.sentences[this.index];
        if (!sentence || sentence.segments.every(s => s.node.isConnected)) {
            return;
        }
        const fresh = this.collect();
        const target = fresh.findIndex(s => s.rawStart >= sentence.rawStart);
        this.sentences = fresh;
        this.index = target;
    },

    emit() {
        this.refresh();
        const sentence = this.sentences[this.index];
        if (!sentence) {
            this.clear();
            this.hooks.post({ hoshi: 'tts-end' });
            return;
        }
        const ranges = this.sentenceRanges(sentence);
        CSS.highlights.set('hoshi-tts', new Highlight(...ranges));
        this.hooks.reveal(ranges[0]);
        this.hooks.post({
            hoshi: 'tts-sentence',
            index: this.index,
            total: this.sentences.length,
            text: sentence.text,
        });
    },

    isVisible(rect) {
        return rect.width > 0 && rect.height > 0
            && rect.right > 0 && rect.left < window.innerWidth
            && rect.bottom > 0 && rect.top < window.innerHeight;
    },

    firstVisible() {
        let fallback = -1;
        for (let i = 0; i < this.sentences.length; i++) {
            const ranges = this.sentenceRanges(this.sentences[i]);
            const rects = ranges.flatMap(range => [...range.getClientRects()]);
            if (!rects.length) {
                continue;
            }
            if (this.isVisible(rects[0])) {
                return i;
            }
            if (fallback < 0 && rects.some(rect => this.isVisible(rect))) {
                fallback = i;
            }
        }
        if (fallback >= 0) {
            return fallback;
        }
        // Nothing starts on this page (e.g. an illustration): read from the next text.
        const vertical = window.hoshiReader.isVertical();
        for (let i = 0; i < this.sentences.length; i++) {
            const rect = this.sentenceRanges(this.sentences[i])[0].getClientRects()[0];
            if (!rect) {
                continue;
            }
            const after = vertical
                ? rect.right <= 0
                : rect.left >= window.innerWidth || rect.top >= window.innerHeight;
            if (after) {
                return i;
            }
        }
        return -1;
    },

    blockOf(node) {
        return node.parentElement?.closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, section, td, th, body') ?? document.body;
    },

    collect() {
        const reader = window.hoshiReader;
        const brackets = window.hoshiSelection?.brackets ?? { '「': '」', '『': '』', '（': '）', '(': ')', '【': '】' };
        const open = Object.keys(brackets);
        const close = Object.values(brackets);
        const delimiters = '。！？!?\n';
        const maxLength = 200;

        const sentences = [];
        let segments = [];
        let text = '';
        let rawStart = 0;
        let depth = 0;
        let ended = false;
        let delimiterInside = false;
        let block = null;
        let raw = 0;

        const flush = () => {
            const spoken = text.replace(/\s+/g, ' ').trim();
            if (spoken && reader.ttuRegex.test(spoken)) {
                sentences.push({ segments, text: spoken, rawStart });
            }
            segments = [];
            text = '';
            ended = false;
            delimiterInside = false;
            depth = 0;
        };

        const walker = reader.createWalker();
        let node;
        while (node = walker.nextNode()) {
            const content = node.textContent;
            if (!content) {
                continue;
            }
            const owner = this.blockOf(node);
            if (block && owner !== block) {
                flush();
            }
            block = owner;

            let segmentStart = 0;
            const closeSegment = (end) => {
                if (end > segmentStart) {
                    segments.push({ node, start: segmentStart, end });
                }
            };

            let i = 0;
            for (const char of content) {
                if (ended && char.trim() && !delimiters.includes(char) && !close.includes(char)) {
                    closeSegment(i);
                    flush();
                    segmentStart = i;
                }
                if (!segments.length && segmentStart === i) {
                    rawStart = raw;
                }
                if (open.includes(char)) {
                    depth++;
                } else if (depth && close.includes(char)) {
                    depth--;
                    if (!depth && delimiterInside) {
                        ended = true;
                        delimiterInside = false;
                    }
                } else if (delimiters.includes(char)) {
                    if (depth) {
                        delimiterInside = true;
                    } else {
                        ended = true;
                    }
                }
                text += char;
                if (text.length >= maxLength && (char === '、' || char === ',' || char === ' ')) {
                    i += char.length;
                    raw += 1;
                    closeSegment(i);
                    flush();
                    segmentStart = i;
                    continue;
                }
                i += char.length;
                raw += 1;
            }
            closeSegment(content.length);
        }
        flush();
        return sentences;
    },
};
