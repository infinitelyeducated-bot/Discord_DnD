import { LAYOUT_STORAGE_KEY, DEFAULT_LAYOUT_SETTINGS } from './config.js?v=mvvrqkfn';

export class LayoutManager {
    constructor() {
        this.layoutSettings = structuredClone(DEFAULT_LAYOUT_SETTINGS);
        this.layoutEditMode = false;
        this.activeDrag = null;
        this.activeResize = null;
        this.loadSettings();
        this.bindGlobalEvents();
    }

    getItems() {
        const items = [
            ['game-help', '.game-help'],
            ['game-brand', '.game-brand'],
            ['level-title', '#level-title'],
            ['dungeon-map', '#dungeon-map'],
            ['map-legend', '.legend'],
            ['action-legend', '.action-legend'],
            ['game-log', '.game-log-section'],
            ['character-sheets', '#character-sheets'],
            ['party-setup', '.party-setup']
        ].map(([key, selector]) => [key, document.querySelector(selector)])
            .filter(([, element]) => element);
        document.querySelectorAll('.character-sheet').forEach(card => {
            const memberId = card.dataset.memberId;
            if (memberId) items.push([`character-sheet-${memberId}`, card]);
        });
        return items;
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
            if (saved === null) return;
            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved layout must be an object.');
            this.layoutSettings = { ...structuredClone(DEFAULT_LAYOUT_SETTINGS), ...parsed };
            this.layoutSettings['game-help'] = { x: 0, y: 0 };
        } catch (error) {
            console.error('Could not load saved layout:', error);
        }
    }

    persistSettings() {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(this.layoutSettings));
        } catch (error) {
            console.error('Could not save layout:', error);
        }
    }

    restoreItem(key, element) {
        const saved = this.layoutSettings[key];
        const x = Number(saved?.x);
        const y = Number(saved?.y);
        element.style.setProperty('--layout-x', `${Number.isFinite(x) ? x : 0}px`);
        element.style.setProperty('--layout-y', `${Number.isFinite(y) ? y : 0}px`);
        if (Number.isFinite(Number(saved?.width)) && Number(saved.width) >= 48) element.style.width = `${Number(saved.width)}px`;
        if (Number.isFinite(Number(saved?.height)) && Number(saved.height) >= 32) element.style.height = `${Number(saved.height)}px`;
    }

    saveItem(key, element) {
        const x = Number.parseFloat(element.style.getPropertyValue('--layout-x')) || 0;
        const y = Number.parseFloat(element.style.getPropertyValue('--layout-y')) || 0;
        const existing = this.layoutSettings[key] || {};
        this.layoutSettings[key] = { ...existing, x, y };
        if (element.dataset.layoutResized === 'true') {
            const rect = element.getBoundingClientRect();
            this.layoutSettings[key].width = Math.round(rect.width);
            this.layoutSettings[key].height = Math.round(rect.height);
        }
        this.persistSettings();
    }

    refresh() {
        for (const [key, element] of this.getItems()) {
            element.dataset.layoutKey = key;
            element.classList.add('layout-edit-item');
            this.restoreItem(key, element);
            element.classList.toggle('layout-edit-active', this.layoutEditMode);
            element.querySelector(':scope > .layout-drag-handle')?.remove();
            if (!this.layoutEditMode) continue;

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'layout-drag-handle';
            handle.textContent = 'MOVE';
            handle.setAttribute('aria-label', `Move ${key.replaceAll('-', ' ')}`);
            handle.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                this.activeDrag = {
                    element,
                    key,
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: Number.parseFloat(element.style.getPropertyValue('--layout-x')) || 0,
                    originY: Number.parseFloat(element.style.getPropertyValue('--layout-y')) || 0
                };
                handle.setPointerCapture?.(event.pointerId);
            });
            element.appendChild(handle);
        }
    }

    setEditMode(enabled) {
        this.layoutEditMode = enabled;
        document.body.classList.toggle('layout-edit-mode', enabled);
        this.refresh();
    }

    reset() {
        this.layoutSettings = structuredClone(DEFAULT_LAYOUT_SETTINGS);
        for (const [, element] of this.getItems()) {
            element.style.removeProperty('--layout-x');
            element.style.removeProperty('--layout-y');
            element.style.removeProperty('width');
            element.style.removeProperty('height');
            delete element.dataset.layoutResized;
        }
        this.refresh();
        this.persistSettings();
    }

    bindGlobalEvents() {
        document.addEventListener('pointermove', event => {
            if (!this.activeDrag) return;
            const { element, startX, startY, originX, originY } = this.activeDrag;
            element.style.setProperty('--layout-x', `${originX + event.clientX - startX}px`);
            element.style.setProperty('--layout-y', `${originY + event.clientY - startY}px`);
        });

        document.addEventListener('pointerup', event => {
            if (this.activeDrag) {
                const { element, key } = this.activeDrag;
                this.activeDrag = null;
                this.saveItem(key, element);
                return;
            }
            const target = this.activeResize;
            this.activeResize = null;
            if (!target?.dataset.layoutKey) return;
            target.dataset.layoutResized = 'true';
            this.saveItem(target.dataset.layoutKey, target);
        });

        document.addEventListener('pointerdown', event => {
            if (!this.layoutEditMode || !(event.target instanceof Element)) return;
            const target = event.target.closest('.layout-edit-active');
            if (!target || event.target.closest('.layout-drag-handle')) return;
            if (event.target !== target) return;
            const rect = target.getBoundingClientRect();
            if (event.clientX >= rect.right - 24 && event.clientY >= rect.bottom - 24) {
                this.activeResize = target;
            }
        });

        document.addEventListener('pointercancel', () => {
            this.activeDrag = null;
            this.activeResize = null;
        });
    }
}
