import _ from 'lodash';
import Promise from 'bluebird';
import path from 'path';
import File from 'file-js';

import {
  negate,
  compose
} from './functions';

import {
  reducePaths
} from './files';

import {
  fromFirst,
  copy,
  from
} from './arrays';

import {
  isDate,
  isNumber
} from 'unit-compare';

import {
  EventEmitter
} from 'events';

function isDefined(value) {
  return value !== undefined;
}

function flatten(a, b) {
  return a.concat(b);
}

function isRegExpMatch(pattern) {
  return (file) => {
    return new RegExp(pattern).test(file.getName());
  };
}

function cleanExtension(ext) {
  if (_.startsWith(ext, '.')) {
    return ext.slice(1);
  }
  return ext;
}

/** @class */
class FileHound extends EventEmitter {
  constructor() {
    super();
    this._filters = [];
    this._searchPaths = [];
    this._searchPaths.push(process.cwd());
    this._ignoreHiddenDirectories = false;
    this._isMatch = _.noop;
    this._sync = false;
    this._directoriesOnly = false;
    this._includeStats = false;
  }

  /**
   * Static factory method to create an instance of FileHound
   *
   * @static
   * @memberOf FileHound
   * @method
   * create
   * @return FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   */
  static create() {
    return new FileHound();
  }

  /**
   * Returns all matches from one of more FileHound instances
   *
   * @static
   * @memberOf FileHound
   * @method
   * any
   * @return a promise containing all matches. If the Promise fulfils,
   * the fulfilment value is an array of all matching files.
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.any(fh1, fh2);
   */
  static any() {
    const args = from(arguments);
    return Promise.all(args).reduce(flatten, []);
  }

  /**
   * Filters by modifiction time
   *
   * @memberOf FileHound
   * @method
   * modified
   * @param {string} dateExpression - date expression
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .modified("< 2 days")
   *   .find()
   *   .each(console.log);
   */
  modified(pattern) {
    this.addFilter((file) => {
      const modified = file.lastModifiedSync();
      return isDate(modified).assert(pattern);
    });
    return this;
  }

  /**
   * Filters by file access time
   *
   * @memberOf FileHound
   * @method
   * accessed
   * @param {string} dateExpression - date expression
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .accessed("< 10 minutes")
   *   .find()
   *   .each(console.log);
   */
  accessed(pattern) {
    this.addFilter((file) => {
      const accessed = file.lastAccessedSync();
      return isDate(accessed).assert(pattern);
    });
    return this;
  }

  /**
   * Filters change time
   *
   * @memberOf FileHound
   * @instance
   * @method
   * changed
   * @param {string} dateExpression - date expression
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .changed("< 10 minutes")
   *   .find()
   *   .each(console.log);
   */
  changed(pattern) {
    this.addFilter((file) => {
      const changed = file.lastChangedSync();
      return isDate(changed).assert(pattern);
    });
    return this;
  }

  /**
   *
   * @memberOf FileHound
   * @instance
   * @method
   * addFilter
   * @param {function} function - custom filter function
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .addFilter(customFilter)
   *   .find()
   *   .each(console.log);
   */
  addFilter(filter) {
    this._filters.push(filter);
    return this;
  }

  /**
   * Defines the search paths
   *
   * @memberOf FileHound
   * @instance
   * @method
   * paths
   * @param {array} path - array of paths
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .paths("/tmp", "/etc") // or ["/tmp", "/etc"]
   *   .find()
   *   .each(console.log);
   */
  paths() {
    this._searchPaths = _.uniq(from(arguments)).map(path.normalize);
    return this;
  }

  /**
   * Define the search path
   *
   * @memberOf FileHound
   * @instance
   * @method
   * path
   * @param {string} path - path
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .path("/tmp")
   *   .find()
   *   .each(console.log);
   */
  path() {
    return this.paths(fromFirst(arguments));
  }

  /**
   * Ignores files or sub-directories matching pattern
   *
   * @memberOf FileHound
   * @instance
   * @method
   * discard
   * @param {string|array} regex - regex or array of regex
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .discard("*.tmp*")
   *   .find()
   *   .each(console.log);
   */
  discard() {
    const patterns = from(arguments);
    patterns.forEach((pattern) => {
      this.addFilter(negate(isRegExpMatch(pattern)));
    });
    return this;
  }

  /**
   * Filter on file extension
   *
   * @memberOf FileHound
   * @instance
   * @method
   * ext
   * @param {string|array} extensions - extension or an array of extensions
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * let filehound = FileHound.create();
   * filehound
   *   .ext(".json")
   *   .find()
   *   .each(console.log);
   *
   * // array of extensions to filter by
   * filehound = FileHound.create();
   * filehound
   *   .ext([".json", ".txt"])
   *   .find()
   *   .each(console.log);
   *
   * // supports var args
   * filehound = FileHound.create();
   * filehound
   *   .ext(".json", ".txt")
   *   .find()
   *   .each(console.log);
   */
  ext() {
    const extensions = from(arguments).map(cleanExtension);

    this.addFilter((file) => {
      return _.includes(extensions, file.getPathExtension());
    });
    return this;
  }

  /**
   * Filter by file size
   *
   * @memberOf FileHound
   * @instance
   * @method
   * size
   * @param {string} sizeExpression - a size expression
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .size("<10kb")
   *   .find()
   *   .each(console.log);
   */
  size(sizeExpression) {
    this.addFilter((file) => {
      const size = file.sizeSync();
      return isNumber(size).assert(sizeExpression);
    });
    return this;
  }

  /**
   * Filter by zero length files
   *
   * @memberOf FileHound
   * @instance
   * @method
   * isEmpty
   * @param {string} path - path
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .size("<10kb")
   *   .find()
   *   .each(console.log);
   */
  isEmpty() {
    this.size(0);
    return this;
  }

  /**
   * Filter by a file glob
   *
   * @memberOf FileHound
   * @instance
   * @method
   * glob
   * @param {array} glob - array of globs
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .glob(['*tmp*']) // .glob('*tmp*') || .glob('*tmp1*','*tmp2*')
   *   .find()
   *   .each(console.log); // array of files names all containing 'tmp'
   */
  glob() {
    return this.match(from(arguments));
  }

  /**
   * Same as glob
   * @see glob
   */
  match(globPatterns) {
    if (_.isArray(globPatterns)) {
      this.addFilter((file) => {
        const isMatch = globPatterns.filter((globPattern) => file.isMatch(globPattern))[0];
        return isMatch ? true : false;
      });
    } else {
      this.addFilter((file) => {
        return file.isMatch(globPatterns);
      });
    }
    return this;
  }

  /**
   * Negates filters
   *
   * @memberOf FileHound
   * @instance
   * @method
   * not
   * @param {string} glob - file glob
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .not()
   *   .glob("*tmp*")
   *   .find()
   *   .each(console.log); // array of files names NOT containing 'tmp'
   */
  not() {
    this.negateFilters = true;
    return this;
  }

  /**
   * Filter to ignore hidden files
   *
   * @memberOf FileHound
   * @instance
   * @method
   * ignoreHiddenFiles
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .ignoreHiddenFiles()
   *   .find()
   *   .each(console.log); // array of files names that are not hidden files
   */
  ignoreHiddenFiles() {
    this.addFilter((file) => {
      return !file.isHiddenSync();
    });
    return this;
  }

  /**
   * Ignore hidden directories
   *
   * @memberOf FileHound
   * @instance
   * @method
   * ignoreHiddenDirectories
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .ignoreHiddenDirectories()
   *   .find()
   *   .each(console.log); // array of files names that are not hidden directories
   */
  ignoreHiddenDirectories() {
    this._ignoreHiddenDirectories = true;
    return this;
  }

  /**
   * Include file stats 
   *
   * @memberOf FileHound
   * @instance
   * @method
   * includeFileStats
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .includeFileStats()
   *   .find()
   *   .each(console.log); // array of file objects containing `path` and `stats` properties
   */
  includeFileStats() {
    this._includeStats = true;
    return this;
  }

  /**
   * Find sub-directories
   *
   * @memberOf FileHound
   * @instance
   * @method
   * directory
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .directory()
   *   .find()
   *   .each(console.log); // array of matching sub-directories
   */
  directory() {
    this._directoriesOnly = true;
    return this;
  }

  /**
   * Find sockets
   *
   * @memberOf FileHound
   * @instance
   * @method
   * socket
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .socket()
   *   .find()
   *   .each(console.log); // array of matching sockets
   */
  socket() {
    this.addFilter((file) => {
      return file.isSocket();
    });
    return this;
  }

  /**
   * Specify the directory search depth. If set to zero, recursive searching
   * will be disabled
   *
   * @memberOf FileHound
   * @instance
   * @method
   * depth
   * @return a FileHound instance
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .depth(0)
   *   .find()
   *   .each(console.log); // array of files names only in the current directory
   */
  depth(depth) {
    this.maxDepth = depth;
    return this;
  }

  /**
   * Asynchronously executes a file search.
   *
   * @memberOf FileHound
   * @instance
   * @method
   * find
   * @param {function} function - Optionally accepts a callback function
   * @return Returns a Promise of all matches. If the Promise fulfils,
   * the fulfilment value is an array of all matching files
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * filehound
   *   .find()
   *   .each(console.log);
   *
   * // using a callback
   * filehound
   *   .find((err, files) => {
   *      if (err) return console.error(err);
   *
   *      console.log(files);
   *   });
   */
  find(cb) {
    this._initFilters();

    const searchAsync = this._searchAsync.bind(this);
    const searches = Promise.map(this.getSearchPaths(), searchAsync);

    return Promise
      .all(searches)
      .reduce(flatten)
      .map(this.formatResult.bind(this))
      .catch((e) => {
        this.emit('error', e);
        throw e;
      })
      .finally(() => {
        this.emit('end');
      })
      .asCallback(cb);
  }

  /**
   * Synchronously executes a file search.
   *
   * @memberOf FileHound
   * @instance
   * @method
   * findSync
   * @return Returns an array of all matching files
   * @example
   * import FileHound from 'filehound';
   *
   * const filehound = FileHound.create();
   * const files = filehound.findSync();
   * console.log(files);
   *
   */
  findSync() {
    this._initFilters();

    const searchSync = this._searchSync.bind(this);

    return this.getSearchPaths()
      .map(searchSync)
      .reduce(flatten)
      .map(this.formatResult.bind(this));
  }

  _atMaxDepth(root, dir) {
    const depth = dir.getDepthSync() - root.getDepthSync();
    return isDefined(this.maxDepth) && depth > this.maxDepth;
  }

  _shouldFilterDirectory(root, dir) {
    return this._atMaxDepth(root, dir) ||
      (this._ignoreHiddenDirectories && dir.isHiddenSync());
  }

  _newMatcher() {
    const isMatch = compose(this._filters);
    if (this.negateFilters) {
      return negate(isMatch);
    }
    return isMatch;
  }

  _initFilters() {
    this._isMatch = this._newMatcher();
  }

  _searchSync(dir) {
    this._sync = true;
    const root = File.create(dir);
    const trackedPaths = [];
    const files = this._search(root, root, trackedPaths);
    return this._directoriesOnly ? trackedPaths.filter(this._isMatch) : files;
  }

  _searchAsync(dir) {
    const root = File.create(dir);
    const trackedPaths = [];
    const pending = this._search(root, root, trackedPaths);

    return pending
      .then((files) => {
        if (this._directoriesOnly) return trackedPaths.filter(this._isMatch);

        files.forEach((file) => {
          this.emit('match', file.getName());
        });
        return files;
      });
  }

  _search(root, path, trackedPaths) {
    if (this._shouldFilterDirectory(root, path)) return [];

    const getFiles = this._sync ? path.getFilesSync.bind(path) : path.getFiles.bind(path);
    return getFiles()
      .map((file) => {
        let isDir = false;
        try {
          isDir = file.isDirectorySync();
          // eslint-disable-next-line no-empty
        } catch (e) { }

        if (isDir) {
          if (!this._shouldFilterDirectory(root, file)) trackedPaths.push(file);
          return this._search(root, file, trackedPaths);
        }
        return file;
      })
      .reduce(flatten, [])
      .filter(this._isMatch);
  }

  formatResult(file) {
    if (this._includeStats) {
      return {
        path: file.getName(),
        stats: file._getStatsSync()
      };
    }
    return file.getName();
  }

  getSearchPaths() {
    const paths = isDefined(this.maxDepth) ? this._searchPaths : reducePaths(this._searchPaths);

    return copy(paths);
  }
}

export default FileHound;
