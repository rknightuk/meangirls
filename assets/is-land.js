class Island extends HTMLElement {
    static tagName = "is-land";
    static prefix = "is-land--";
    static attr = {
      template: "data-island",
      ready: "ready",
      defer: "defer-hydration",
    };
  
    static onceCache = new Map();
    static onReady = new Map();
  
    static fallback = {
      ":not(is-land,:defined,[defer-hydration])": (readyPromise, node, prefix) => {
        // remove from document to prevent web component init
        let cloned = document.createElement(prefix + node.localName);
        for(let attr of node.getAttributeNames()) {
          cloned.setAttribute(attr, node.getAttribute(attr));
        }
      
        // Declarative Shadow DOM (with polyfill)
        let shadowroot = node.shadowRoot;
        if(!shadowroot) {
          let tmpl = node.querySelector(":scope > template:is([shadowrootmode], [shadowroot])");
          if(tmpl) {
            let mode = tmpl.getAttribute("shadowrootmode") || tmpl.getAttribute("shadowroot") || "closed";
            shadowroot = node.attachShadow({ mode }); // default is closed
            shadowroot.appendChild(tmpl.content.cloneNode(true));
          }
        }
      
        // Cheers to https://gist.github.com/developit/45c85e9be01e8c3f1a0ec073d600d01e
        if(shadowroot) {
          cloned.attachShadow({ mode: shadowroot.mode }).append(...shadowroot.childNodes);
        }
      
        // Keep *same* child nodes to preserve state of children (e.g. details->summary)
        cloned.append(...node.childNodes);
        node.replaceWith(cloned);
      
        return readyPromise.then(() => {
          // Restore original children and shadow DOM
          if(cloned.shadowRoot) {
            node.shadowRoot.append(...cloned.shadowRoot.childNodes);
          }
          node.append(...cloned.childNodes);
          cloned.replaceWith(node);
        });
      }
    }
  
    constructor() {
      super();
  
      // Internal promises
      this.ready = new Promise(resolve => {
        this.readyResolve = resolve;
      });
    }
  
    // any parents of `el` that are <is-land> (with conditions)
    static getParents(el, stopAt = false) {
      let nodes = [];
      while(el) {
        if(el.matches && el.matches(Island.tagName)) {
          if(stopAt && el === stopAt) {
            break;
          }
  
          if(Conditions.hasConditions(el)) {
            nodes.push(el);
          }
        }
        el = el.parentNode;
      }
      return nodes;
    }
  
    static async ready(el, parents) {
      if(!parents) {
        parents = Island.getParents(el);
      }
      if(parents.length === 0) {
        return;
      }
      let imports = await Promise.all(parents.map(p => p.wait()));
      // return innermost module import
      if(imports.length) {
        return imports[0];
      }
    }
  
    forceFallback() {
      if(window.Island) {
        Object.assign(Island.fallback, window.Island.fallback);
      }
  
      for(let selector in Island.fallback) {
        // Reverse here as a cheap way to get the deepest nodes first
        let components = Array.from(this.querySelectorAll(selector)).reverse();
  
        // with thanks to https://gist.github.com/cowboy/938767
        for(let node of components) {
          if(!node.isConnected) {
            continue;
          }
  
          let parents = Island.getParents(node);
          // must be in a leaf island (not nested deep)
          if(parents.length === 1) {
            let p = Island.ready(node, parents);
            Island.fallback[selector](p, node, Island.prefix);
          }
        }
      }
    }
  
    wait() {
      return this.ready;
    }
  
    async connectedCallback() {
      // Only use fallback content with loading conditions
      if(Conditions.hasConditions(this)) {
        // Keep fallback content without initializing the components
        this.forceFallback();
      }
  
      await this.hydrate();
    }
  
    getTemplates() {
      return this.querySelectorAll(`template[${Island.attr.template}]`);
    }
  
    replaceTemplates(templates) {
      // replace <template> with the live content
      for(let node of templates) {
        // if the template is nested inside another child <is-land> inside, skip
        if(Island.getParents(node, this).length > 0) {
          continue;
        }
  
        let value = node.getAttribute(Island.attr.template);
        // get rid of the rest of the content on the island
        if(value === "replace") {
          let children = Array.from(this.childNodes);
          for(let child of children) {
            this.removeChild(child);
          }
          this.appendChild(node.content);
          break;
        } else {
          let html = node.innerHTML;
          if(value === "once" && html) {
            if(Island.onceCache.has(html)) {
              node.remove();
              return;
            }
  
            Island.onceCache.set(html, true);
          }
  
          node.replaceWith(node.content);
        }
      }
    }
  
    async hydrate() {
      let conditions = [];
      if(this.parentNode) {
        // wait for all parents before hydrating
        conditions.push(Island.ready(this.parentNode));
      }
  
      let attrs = Conditions.getConditions(this);
      for(let condition in attrs) {
        if(Conditions.map[condition]) {
          conditions.push(Conditions.map[condition](attrs[condition], this));
        }
      }
  
      // Loading conditions must finish before dependencies are loaded
      await Promise.all(conditions);
  
      this.replaceTemplates(this.getTemplates());
  
      for(let fn of Island.onReady.values()) {
        await fn.call(this, Island);
      }
  
      this.readyResolve();
  
      this.setAttribute(Island.attr.ready, "");
  
      // Remove [defer-hydration]
      this.querySelectorAll(`[${Island.attr.defer}]`).forEach(node => node.removeAttribute(Island.attr.defer));
    }
  }
  
  class Conditions {
    static map = {
      visible: Conditions.visible,
      idle: Conditions.idle,
      interaction: Conditions.interaction,
      media: Conditions.media,
      "save-data": Conditions.saveData,
    };
  
    static hasConditions(node) {
      return Object.keys(Conditions.getConditions(node)).length > 0;
    }
  
    static getConditions(node) {
      let map = {};
      for(let key of Object.keys(Conditions.map)) {
        if(node.hasAttribute(`on:${key}`)) {
          map[key] = node.getAttribute(`on:${key}`);
        }
      }
  
      return map;
    }
  
    static visible(noop, el) {
      if(!('IntersectionObserver' in window)) {
        // runs immediately
        return;
      }
  
      return new Promise(resolve => {
        let observer = new IntersectionObserver(entries => {
          let [entry] = entries;
          if(entry.isIntersecting) {
            observer.unobserve(entry.target);
            resolve();
          }
        });
  
        observer.observe(el);
      });
    }
  
    // Warning: on:idle is not very useful with other conditions as it may resolve long before.
    static idle() {
      let onload = new Promise(resolve => {
        if(document.readyState !== "complete") {
          window.addEventListener("load", () => resolve(), { once: true });
        } else {
          resolve();
        }
      });
  
      if(!("requestIdleCallback" in window)) {
        // run immediately
        return onload;
      }
  
      // both idle and onload
      return Promise.all([
        new Promise(resolve => {
          requestIdleCallback(() => {
            resolve();
          });
        }),
        onload,
      ]);
    }
  
    static interaction(eventOverrides, el) {
      let events = ["click", "touchstart"];
      // event overrides e.g. on:interaction="mouseenter"
      if(eventOverrides) {
        events = (eventOverrides || "").split(",").map(entry => entry.trim());
      }
  
      return new Promise(resolve => {
        function resolveFn(e) {
          resolve();
  
          // cleanup the other event handlers
          for(let name of events) {
            el.removeEventListener(name, resolveFn);
          }
        }
  
        for(let name of events) {
          el.addEventListener(name, resolveFn, { once: true });
        }
      });
    }
  
    static media(query) {
      let mm = {
        matches: true
      };
  
      if(query && ("matchMedia" in window)) {
        mm = window.matchMedia(query);
      }
  
      if(mm.matches) {
        return;
      }
  
      return new Promise(resolve => {
        mm.addListener(e => {
          if(e.matches) {
            resolve();
          }
        });
      });
    }
  
    static saveData(expects) {
      // return early if API does not exist
      if(!("connection" in navigator) || navigator.connection.saveData === (expects !== "false")) {
        return;
      }
  
      // dangly promise
      return new Promise(() => {});
    }
  }
  
  // Should this auto define? Folks can redefine later using { component } export
  if("customElements" in window) {
    window.customElements.define(Island.tagName, Island);
    window.Island = Island;
  }
  
  export {
    Island,
    Island as component, // Backwards compat only: recommend `Island` export
  };
  
  // TODO remove in 4.0
  export const ready = Island.ready; // Backwards compat only: recommend `Island` export