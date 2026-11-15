var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../deps-main/node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "../deps-main/node_modules/react/cjs/react.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result, thenable = ctor();
        thenable.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = thenable);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    function startTransition(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      currentTransition.types = null !== prevTransition ? prevTransition.types : null;
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    }
    function addTransitionType(type) {
      var transition = ReactSharedInternals.T;
      if (null !== transition) {
        var transitionTypes = transition.types;
        null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
      } else startTransition(addTransitionType.bind(null, type));
    }
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports.Activity = REACT_ACTIVITY_TYPE;
    exports.Children = Children;
    exports.Component = Component;
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.Profiler = REACT_PROFILER_TYPE;
    exports.PureComponent = PureComponent;
    exports.StrictMode = REACT_STRICT_MODE_TYPE;
    exports.Suspense = REACT_SUSPENSE_TYPE;
    exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
    exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports.addTransitionType = addTransitionType;
    exports.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports.cacheSignal = function() {
      return null;
    };
    exports.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports.isValidElement = isValidElement;
    exports.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports.startTransition = startTransition;
    exports.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports.version = "19.3.1";
  }
});

// ../deps-main/node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "../deps-main/node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
          case REACT_VIEW_TRANSITION_TYPE:
            return "ViewTransition";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var resolveDebugValue = null, rejectDebugValue = null, ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now(), ioInfo.value = new Promise(function(resolve, reject) {
            resolveDebugValue = resolve;
            rejectDebugValue = reject;
          }));
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                if (null != _ioInfo) {
                  _ioInfo.end = performance.now();
                  var debugValue = null == moduleObject ? void 0 : moduleObject.default;
                  resolveDebugValue(debugValue);
                  _ioInfo.value.status = "fulfilled";
                  _ioInfo.value.value = debugValue;
                }
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now(), _ioInfo2.value.then(noop, noop), rejectDebugValue(error), _ioInfo2.value.status = "rejected", _ioInfo2.value.reason = error);
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function startTransition(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition.types = null !== prevTransition ? prevTransition.types : null;
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      }
      function addTransitionType(type) {
        var transition = ReactSharedInternals.T;
        if (null !== transition) {
          var transitionTypes = transition.types;
          null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
        } else
          0 === ReactSharedInternals.asyncTransitions && console.error(
            "addTransitionType can only be called inside a `startTransition()` callback. It must be associated with a specific Transition."
          ), startTransition(addTransitionType.bind(null, type));
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module && module[requireString]).call(
              module,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports.Activity = REACT_ACTIVITY_TYPE;
      exports.Children = fnName;
      exports.Component = Component;
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.Profiler = REACT_PROFILER_TYPE;
      exports.PureComponent = PureComponent;
      exports.StrictMode = REACT_STRICT_MODE_TYPE;
      exports.Suspense = REACT_SUSPENSE_TYPE;
      exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
      exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports.__COMPILER_RUNTIME = deprecatedAPIs;
      exports.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports.addTransitionType = addTransitionType;
      exports.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports.cacheSignal = function() {
        return null;
      };
      exports.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        var propName;
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        (propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++) ? (childArray = Error.stackTraceLimit, Error.stackTraceLimit = 10, childrenLength = Error("react-stack-top-frame"), Error.stackTraceLimit = childArray) : childrenLength = unknownOwnerDebugStack;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          childrenLength,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports.isValidElement = isValidElement;
      exports.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports.startTransition = startTransition;
      exports.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports.useId = function() {
        return resolveDispatcher().useId();
      };
      exports.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports.version = "19.3.1";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// ../deps-main/node_modules/react/index.js
var require_react = __commonJS({
  "../deps-main/node_modules/react/index.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_production();
    } else {
      module.exports = require_react_development();
    }
  }
});

// scripts/v3/sweep-lib.ts
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// src/lib/classical-v3/hectograph-engine.ts
var DEFAULT_HECTOGRAPH_V3_CONFIG = {
  outputMode: "hectograph-purple",
  anchorWeight: 1.3,
  fineDetailGain: 1.15,
  flowShadingStrength: 0.6,
  localContrastBoost: 0.7,
  haloProtection: 1.5,
  inkBudget: 0.3,
  inkFloorCap: 0.5,
  broadDoG: true,
  hessianSigma32: true,
  thin: false,
  thinWidth: 3
};
function thinLayer(layer, tx, ty, width, height, targetWidth) {
  const N = width * height;
  const spine = new Float32Array(N);
  const floor = 1e-4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = layer[i];
      if (v <= floor) continue;
      const nx = ty[i];
      const ny = -tx[i];
      const xa = Math.min(width - 1, Math.max(0, Math.round(x + nx)));
      const ya = Math.min(height - 1, Math.max(0, Math.round(y + ny)));
      const xb = Math.min(width - 1, Math.max(0, Math.round(x - nx)));
      const yb = Math.min(height - 1, Math.max(0, Math.round(y - ny)));
      if (v >= layer[ya * width + xa] && v > layer[yb * width + xb]) spine[i] = v;
    }
  }
  const w = Number.isFinite(targetWidth) ? Math.max(1, Math.min(5, Math.round(targetWidth))) : 3;
  if (w <= 1) return spine;
  const r = Math.floor(w / 2);
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  const lo = r;
  const hi = w % 2 === 0 ? r - 1 : r;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      const a = Math.max(0, x - lo);
      const b = Math.min(width - 1, x + hi);
      for (let k = a; k <= b; k++) if (spine[row + k] > m) m = spine[row + k];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      const a = Math.max(0, y - lo);
      const b = Math.min(height - 1, y + hi);
      for (let k = a; k <= b; k++) if (tmp[k * width + x] > m) m = tmp[k * width + x];
      out[y * width + x] = m;
    }
  }
  return out;
}
var PAPER_GATE = 0.035;
var MAX_INK_FLOOR = 0.5;
var INK_HIST_BINS = 200;
function computeInkFloor(rawInk, budget, cap = MAX_INK_FLOOR) {
  const capV = Number.isFinite(cap) ? Math.min(0.95, Math.max(PAPER_GATE, cap)) : MAX_INK_FLOOR;
  const n = rawInk.length;
  if (n === 0 || !Number.isFinite(budget) || budget >= 1) return PAPER_GATE;
  const b = Math.max(0, budget);
  const hist = new Uint32Array(INK_HIST_BINS + 1);
  for (let i = 0; i < n; i++) {
    const v = rawInk[i];
    const bin = v <= 0 ? 0 : v >= 1 ? INK_HIST_BINS : Math.floor(v * INK_HIST_BINS);
    hist[bin]++;
  }
  const allowed = b * n;
  let suffix = 0;
  const startBin = Math.ceil(PAPER_GATE * INK_HIST_BINS);
  const endBin = Math.floor(capV * INK_HIST_BINS);
  for (let k = INK_HIST_BINS; k > endBin; k--) suffix += hist[k];
  let floorBin = endBin;
  for (let k = endBin; k >= startBin; k--) {
    suffix += hist[k];
    if (suffix > allowed) break;
    floorBin = k;
  }
  const floor = floorBin <= startBin ? PAPER_GATE : floorBin / INK_HIST_BINS;
  return Math.min(capV, Math.max(PAPER_GATE, floor));
}
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function gaussianBlurFloat(src, width, height, sigma) {
  if (sigma <= 0.05) return new Float32Array(src);
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  const s2 = 2 * sigma * sigma;
  for (let i = -radius; i <= radius; i++) {
    const val = Math.exp(-(i * i) / s2);
    kernel[i + radius] = val;
    sum += val;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[rowOffset + nx] * kernel[k + radius];
      }
      temp[rowOffset + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k));
        acc += temp[ny * width + x] * kernel[k + radius];
      }
      dst[rowOffset + x] = acc;
    }
  }
  return dst;
}
function analyzeSceneProfile(rawLum, width, height) {
  const N = rawLum.length;
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(rawLum[i] * 255)));
    hist[bin]++;
  }
  let acc = 0;
  let p2 = 0.02;
  let p98 = 0.98;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= N * 0.02) {
      p2 = i / 255;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= N * 0.02) {
      p98 = i / 255;
      break;
    }
  }
  if (p98 - p2 < 0.15) {
    p2 = 0;
    p98 = 1;
  }
  const smooth = gaussianBlurFloat(rawLum, width, height, 1.2);
  let gradSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    const r = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const dx = smooth[r + x + 1] - smooth[r + x - 1];
      const dy = smooth[r + width + x] - smooth[r - width + x];
      gradSum += Math.hypot(dx, dy);
      count++;
    }
  }
  const edgeDensity = count > 0 ? gradSum / count : 0.08;
  const isUltraDenseGlyph = edgeDensity > 0.125;
  const isSoftPortrait = edgeDensity < 0.072;
  return {
    p2,
    p98,
    edgeDensity,
    // Raise noise gate on dense carvings so background stone doesn't turn purple
    noiseGateBoost: isUltraDenseGlyph ? 1.45 : isSoftPortrait ? 0.72 : 1,
    // Reduce broad shading on Aztec so glyphs stay crisp; boost smooth shading on portraits
    shadingMultiplier: isUltraDenseGlyph ? 0.38 : isSoftPortrait ? 1.15 : 0.85,
    // Boost ocular/nostril/mouth contrast on soft portraits (Baby & Elder)
    portraitFocusBoost: isSoftPortrait ? 1.45 : 1.1,
    // Keep delicate petal veins on botanicals & glyphs without amplifying skin pores on portraits
    fineScaleWeight: isSoftPortrait ? 0.55 : 1.05
  };
}
function normalizeToneAndDetail(rawLum, width, height, boost, scene) {
  const N = width * height;
  const normLum = new Float32Array(N);
  const range = Math.max(0.15, scene.p98 - scene.p2);
  for (let i = 0; i < N; i++) {
    normLum[i] = Math.min(1, Math.max(0, (rawLum[i] - scene.p2) / range));
  }
  const meanSmall = gaussianBlurFloat(normLum, width, height, 3);
  const localMeanLarge = gaussianBlurFloat(normLum, width, height, 22);
  const sqDiff = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = normLum[i] - localMeanLarge[i];
    sqDiff[i] = d * d;
  }
  const localVar = gaussianBlurFloat(sqDiff, width, height, 18);
  const detailEnhancedLum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const L = normLum[i];
    const shadowCurve = Math.pow(L, 0.84);
    const localStd = Math.sqrt(localVar[i]) + 0.11;
    const macroDiff = L - localMeanLarge[i];
    const microDiff = L - meanSmall[i];
    const microGate = smoothstep(8e-3, 0.035, Math.abs(microDiff));
    const gatedMicro = microDiff * microGate;
    const localDetail = (macroDiff * 0.45 + gatedMicro * 0.55) / (localStd * 2.2);
    const eq = Math.min(1, Math.max(0, shadowCurve + localDetail * boost * 0.55));
    detailEnhancedLum[i] = L * (1 - boost * 0.65) + eq * (boost * 0.65);
  }
  return { normLum, detailEnhancedLum, localMeanLarge };
}
function computeEdgeTangentFlow(lum, width, height) {
  const N = width * height;
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  const preSmooth = gaussianBlurFloat(lum, width, height, 0.75);
  for (let y = 1; y < height - 1; y++) {
    const r0 = (y - 1) * width;
    const r1 = y * width;
    const r2 = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const dx = 3 * (preSmooth[r0 + x + 1] - preSmooth[r0 + x - 1]) + 10 * (preSmooth[r1 + x + 1] - preSmooth[r1 + x - 1]) + 3 * (preSmooth[r2 + x + 1] - preSmooth[r2 + x - 1]);
      const dy = 3 * (preSmooth[r2 + x - 1] - preSmooth[r0 + x - 1]) + 10 * (preSmooth[r2 + x] - preSmooth[r0 + x]) + 3 * (preSmooth[r2 + x + 1] - preSmooth[r0 + x + 1]);
      gx[r1 + x] = dx / 32;
      gy[r1 + x] = dy / 32;
    }
  }
  const jxx = new Float32Array(N);
  const jxy = new Float32Array(N);
  const jyy = new Float32Array(N);
  const gradMag = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dx = gx[i];
    const dy = gy[i];
    jxx[i] = dx * dx;
    jxy[i] = dx * dy;
    jyy[i] = dy * dy;
    gradMag[i] = Math.hypot(dx, dy);
  }
  const sxx = gaussianBlurFloat(jxx, width, height, 2.5);
  const sxy = gaussianBlurFloat(jxy, width, height, 2.5);
  const syy = gaussianBlurFloat(jyy, width, height, 2.5);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const coherence = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = sxx[i];
    const b = sxy[i];
    const c = syy[i];
    const trace = a + c;
    const det = a * c - b * b;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    const lambda1 = trace / 2 + disc;
    const lambda2 = Math.max(0, trace / 2 - disc);
    coherence[i] = trace > 1e-5 ? (lambda1 - lambda2) / (lambda1 + lambda2 + 1e-5) : 0;
    let nx = b;
    let ny = lambda1 - a;
    const norm = Math.hypot(nx, ny);
    if (norm > 1e-6) {
      nx /= norm;
      ny /= norm;
    } else {
      nx = 1;
      ny = 0;
    }
    tx[i] = -ny;
    ty[i] = nx;
  }
  return { tx, ty, gradMag, coherence };
}
function extractCleanLinesAndVeins(detailLum, normLum, gradMag, coherence, tx, ty, width, height, config, scene) {
  const N = width * height;
  const anchorLines = new Float32Array(N);
  const detailLines = new Float32Array(N);
  const blurTight = gaussianBlurFloat(detailLum, width, height, 0.9);
  const blurMedium = gaussianBlurFloat(detailLum, width, height, 2.2);
  const blurBroad = config.broadDoG === false ? blurMedium : gaussianBlurFloat(normLum, width, height, 4.8);
  const gateScale = scene.noiseGateBoost;
  for (let i = 0; i < N; i++) {
    const dogFine = blurMedium[i] - blurTight[i];
    const dogBroad = blurBroad[i] - blurMedium[i];
    const fineLine = smoothstep(0.012 * gateScale, 0.055 * gateScale, dogFine) * scene.fineScaleWeight;
    const structuralLine = config.broadDoG === false ? 0 : smoothstep(0.018 * gateScale, 0.085 * gateScale, dogBroad) * scene.portraitFocusBoost;
    detailLines[i] = Math.min(1, fineLine * config.fineDetailGain);
    anchorLines[i] = Math.min(1, structuralLine * config.anchorWeight);
  }
  const scales = [
    {
      sigma: 1,
      lowGate: 0.016 * gateScale,
      highGate: 0.068 * gateScale,
      weight: 0.85 * config.fineDetailGain * scene.fineScaleWeight,
      target: "detail"
    },
    {
      sigma: 1.9,
      lowGate: 0.014 * gateScale,
      highGate: 0.062 * gateScale,
      weight: 1.15 * config.anchorWeight * scene.portraitFocusBoost,
      target: "anchor"
    },
    {
      sigma: 3.2,
      lowGate: 0.012 * gateScale,
      highGate: 0.055 * gateScale,
      weight: 0.95 * config.anchorWeight * scene.portraitFocusBoost,
      target: "anchor"
    }
  ];
  for (const s of scales) {
    if (s.sigma === 3.2 && config.hessianSigma32 === false) continue;
    const blurred = gaussianBlurFloat(detailLum, width, height, s.sigma);
    const normFactor = Math.pow(s.sigma, 1.55);
    for (let y = 1; y < height - 1; y++) {
      const r0 = (y - 1) * width;
      const r1 = y * width;
      const r2 = (y + 1) * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = r1 + x;
        const center = blurred[idx];
        const dxx = blurred[r1 + x + 1] - 2 * center + blurred[r1 + x - 1];
        const dyy = blurred[r2 + x] - 2 * center + blurred[r0 + x];
        const dxy = 0.25 * (blurred[r2 + x + 1] - blurred[r2 + x - 1] - blurred[r0 + x + 1] + blurred[r0 + x - 1]);
        const trace = dxx + dyy;
        const disc = Math.sqrt(Math.max(0, (dxx - dyy) * (dxx - dyy) + 4 * dxy * dxy));
        const lambda1 = 0.5 * (trace + disc) * normFactor;
        const lambda2 = 0.5 * (trace - disc) * normFactor;
        const ridgeNess = lambda1 - 0.35 * Math.abs(lambda2);
        if (ridgeNess > s.lowGate) {
          const gatedVal = smoothstep(s.lowGate, s.highGate, ridgeNess) * s.weight;
          if (s.target === "detail") {
            const cohBoost = 0.45 + 0.55 * coherence[idx];
            detailLines[idx] = Math.min(1, Math.max(detailLines[idx], gatedVal * cohBoost));
          } else {
            anchorLines[idx] = Math.min(1, Math.max(anchorLines[idx], gatedVal));
          }
        }
      }
    }
  }
  if (config.debugAnchorSource2) config.debugAnchorSource2(anchorLines.slice());
  const smoothGrad = gaussianBlurFloat(gradMag, width, height, 0.85);
  const gradLow = 0.025 * gateScale;
  const gradHigh = 0.095 * gateScale;
  for (let y = 1; y < height - 1; y++) {
    const r1 = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = r1 + x;
      const g = smoothGrad[idx];
      if (g <= gradLow) continue;
      const nx = ty[idx];
      const ny = -tx[idx];
      const x1 = Math.min(width - 1, Math.max(0, Math.round(x + nx)));
      const y1 = Math.min(height - 1, Math.max(0, Math.round(y + ny)));
      const x2 = Math.min(width - 1, Math.max(0, Math.round(x - nx)));
      const y2 = Math.min(height - 1, Math.max(0, Math.round(y - ny)));
      if (g >= smoothGrad[y1 * width + x1] * 0.94 && g >= smoothGrad[y2 * width + x2] * 0.94) {
        const edgeVal = smoothstep(gradLow, gradHigh, g) * config.anchorWeight * scene.portraitFocusBoost;
        anchorLines[idx] = Math.min(1, Math.max(anchorLines[idx], edgeVal));
      }
    }
  }
  if (config.debugAnchorSource) config.debugAnchorSource(anchorLines.slice());
  const smoothedAnchor = new Float32Array(N);
  const smoothedDetail = new Float32Array(N);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      const vx = tx[idx];
      const vy = ty[idx];
      let accA = anchorLines[idx] * 0.44;
      let accD = detailLines[idx] * 0.44;
      const steps = [-2, -1, 1, 2];
      const weights = [0.08, 0.2, 0.2, 0.08];
      for (let k = 0; k < 4; k++) {
        const sx = Math.min(width - 1, Math.max(0, Math.round(x + vx * steps[k])));
        const sy = Math.min(height - 1, Math.max(0, Math.round(y + vy * steps[k])));
        const sIdx = sy * width + sx;
        accA += anchorLines[sIdx] * weights[k];
        accD += detailLines[sIdx] * weights[k];
      }
      smoothedAnchor[idx] = Math.min(1, accA);
      smoothedDetail[idx] = Math.min(1, accD);
    }
  }
  if (config.neuralEdgeMap && config.neuralEdgeMap.length === N) {
    for (let i = 0; i < N; i++) {
      const gatedNeural = smoothstep(0.22, 0.72, config.neuralEdgeMap[i]);
      smoothedAnchor[i] = Math.min(1, Math.max(smoothedAnchor[i], gatedNeural * config.anchorWeight));
    }
  }
  const finalAnchor = config.thin === true ? thinLayer(smoothedAnchor, tx, ty, width, height, config.thinWidth ?? 3) : smoothedAnchor;
  return { anchorLines: finalAnchor, detailLines: smoothedDetail };
}
function computeCleanTonalAndCoreShading(normLum, localMeanLarge, coherence, anchorLines, width, height, config, scene) {
  const N = width * height;
  const coreDarkPin = new Float32Array(N);
  const smoothShading = new Float32Array(N);
  const smoothTone = gaussianBlurFloat(normLum, width, height, 1.8);
  const medMean = gaussianBlurFloat(normLum, width, height, 9);
  const anchorHalo = config.haloProtection > 0 ? gaussianBlurFloat(anchorLines, width, height, config.haloProtection) : anchorLines;
  const effectiveShadingStrength = config.flowShadingStrength * scene.shadingMultiplier;
  for (let i = 0; i < N; i++) {
    const L = smoothTone[i];
    const localDarkness = Math.max(0, localMeanLarge[i] - L);
    const medDarkness = Math.max(0, medMean[i] - L);
    const flatDarkArea = 1 - smoothstep(0.3, 0.55, 1 - medMean[i]);
    const structureGate = Math.min(1, medDarkness / 0.06 + flatDarkArea);
    const absoluteDark = smoothstep(0.58, 0.88, 1 - L) * structureGate;
    const relativeDarkPocket = smoothstep(0.05, 0.24, medDarkness);
    coreDarkPin[i] = Math.min(
      1,
      (absoluteDark * 0.65 + relativeDarkPocket * 0.55) * Math.max(absoluteDark, relativeDarkPocket) * scene.portraitFocusBoost
    );
    if (effectiveShadingStrength <= 0.01) continue;
    const shadowZone = smoothstep(0.32, 0.78, 1 - L);
    const recessedPocket = smoothstep(0.02, 0.18, localDarkness);
    const haloSuppress = Math.max(0.15, 1 - anchorHalo[i] * 0.65);
    const rawShade = (shadowZone * 0.55 + recessedPocket * 0.45) * effectiveShadingStrength * haloSuppress;
    const directionalSheen = 0.85 + 0.15 * coherence[i];
    smoothShading[i] = Math.min(1, rawShade * directionalSheen);
  }
  return { coreDarkPin, smoothShading };
}
var SPECKLE_MIN_PIXELS = 14;
var SPECKLE_KEEP_EXTENT = 12;
var SPECKLE_INK_BELOW = 235;
function removeSpeckle(out) {
  const { width, height, data } = out;
  const N = width * height;
  const isInk = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    if ((data[p] + data[p + 1] + data[p + 2]) / 3 < SPECKLE_INK_BELOW) isInk[i] = 1;
  }
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const members = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!isInk[start] || seen[start]) continue;
    let sp = 0;
    let count = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const idx = stack[--sp];
      members[count++] = idx;
      const x = idx % width;
      const y = idx / width | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || dx === 0 && dy === 0) continue;
          const q = ny * width + nx;
          if (isInk[q] && !seen[q]) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }
    const extent = Math.max(maxX - minX + 1, maxY - minY + 1);
    if (count < SPECKLE_MIN_PIXELS && extent < SPECKLE_KEEP_EXTENT) {
      for (let k = 0; k < count; k++) {
        const p = members[k] * 4;
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
      }
    }
  }
}
function renderHectographStencilV3(imageData, userConfig = {}) {
  const config = { ...DEFAULT_HECTOGRAPH_V3_CONFIG, ...userConfig };
  const { width, height, data } = imageData;
  const N = width * height;
  const rawLum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    const alpha = data[p + 3] / 255;
    const r = data[p] / 255 * alpha + (1 - alpha);
    const g = data[p + 1] / 255 * alpha + (1 - alpha);
    const b = data[p + 2] / 255 * alpha + (1 - alpha);
    rawLum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const scene = analyzeSceneProfile(rawLum, width, height);
  const { normLum, detailEnhancedLum, localMeanLarge } = normalizeToneAndDetail(
    rawLum,
    width,
    height,
    config.localContrastBoost,
    scene
  );
  const { tx, ty, gradMag, coherence } = computeEdgeTangentFlow(detailEnhancedLum, width, height);
  const { anchorLines, detailLines } = extractCleanLinesAndVeins(
    detailEnhancedLum,
    normLum,
    gradMag,
    coherence,
    tx,
    ty,
    width,
    height,
    config,
    scene
  );
  const { coreDarkPin, smoothShading } = computeCleanTonalAndCoreShading(
    normLum,
    localMeanLarge,
    coherence,
    anchorLines,
    width,
    height,
    config,
    scene
  );
  const out = new ImageData(width, height);
  const dst = out.data;
  const rawInk = new Float32Array(N);
  if (config.debugLayers) config.debugLayers({ anchorLines, detailLines, coreDarkPin, smoothShading, width, height });
  for (let i = 0; i < N; i++) {
    const aLine = anchorLines[i];
    const dLine = detailLines[i] * 0.72;
    const cPin = coreDarkPin[i] * 0.88;
    const sShade = smoothShading[i] * 0.52;
    rawInk[i] = Math.max(aLine, cPin, dLine, sShade) + Math.min(0.22, aLine * 0.25 + cPin * 0.2);
  }
  const inkFloor = computeInkFloor(rawInk, config.inkBudget ?? 0.3, config.inkFloorCap ?? MAX_INK_FLOOR);
  for (let i = 0; i < N; i++) {
    const aLine = anchorLines[i];
    const cPin = coreDarkPin[i] * 0.88;
    const raw = rawInk[i];
    const totalInk = raw < inkFloor ? 0 : Math.min(1, (raw - inkFloor) / (1 - inkFloor));
    const p = i * 4;
    if (config.outputMode === "hectograph-purple") {
      let r, g, b;
      if (totalInk <= 0.3) {
        const t = totalInk / 0.3;
        r = 255 + (223 - 255) * t;
        g = 255 + (201 - 255) * t;
        b = 255 + (251 - 255) * t;
      } else if (totalInk <= 0.68) {
        const t = (totalInk - 0.3) / 0.38;
        r = 223 + (131 - 223) * t;
        g = 201 + (68 - 201) * t;
        b = 251 + (228 - 251) * t;
      } else {
        const t = (totalInk - 0.68) / 0.32;
        r = 131 + (58 - 131) * t;
        g = 68 + (14 - 68) * t;
        b = 228 + (134 - 228) * t;
      }
      dst[p] = Math.round(r);
      dst[p + 1] = Math.round(g);
      dst[p + 2] = Math.round(b);
      dst[p + 3] = 255;
    } else if (config.outputMode === "pro-graphite") {
      const v = Math.round(255 * (1 - Math.pow(totalInk, 0.95)));
      dst[p] = v;
      dst[p + 1] = v;
      dst[p + 2] = v;
      dst[p + 3] = 255;
    } else {
      const x = i % width;
      const y = i / width | 0;
      const bayer4x4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const threshold = (bayer4x4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const isInk = aLine > 0.45 || cPin > 0.55 || totalInk * 0.72 > threshold;
      const v = isInk ? 0 : 255;
      dst[p] = v;
      dst[p + 1] = v;
      dst[p + 2] = v;
      dst[p + 3] = 255;
    }
  }
  if (config.outputMode !== "thermal-binary") removeSpeckle(out);
  return out;
}

// src/lib/classical-v3/useHectographEngineV3.ts
var import_react = __toESM(require_react(), 1);
var STENCIL_V3_PRESETS = {
  "tattoo-clean": {
    label: "Tattoo Clean (recommended)",
    description: "Sparser single-spine lines and open paper. Scored 70+ on the built-in tattooability check.",
    config: {
      outputMode: "hectograph-purple",
      anchorWeight: 1.25,
      fineDetailGain: 1.15,
      flowShadingStrength: 0,
      localContrastBoost: 0.3,
      haloProtection: 1.5
    }
  },
  "hectograph-rich": {
    label: "Hectograph Rich (Purple)",
    description: "Fuller multi-tone look with engraving strokes. Denser, so it scores lower on tattooability.",
    config: {
      outputMode: "hectograph-purple",
      anchorWeight: 1.3,
      fineDetailGain: 1.2,
      flowShadingStrength: 0.58,
      localContrastBoost: 0.78,
      haloProtection: 1.5
    }
  },
  "floral-botanical": {
    label: "Botanical & Petal Veins",
    description: "Extracts faint white-on-white petal striations while opening up dark leaves",
    config: {
      outputMode: "hectograph-purple",
      anchorWeight: 1.15,
      fineDetailGain: 1.65,
      flowShadingStrength: 0.45,
      localContrastBoost: 0.92,
      haloProtection: 1.2
    }
  },
  "portrait-realism": {
    label: "Portrait & Skin Contours",
    description: "Single-spine wrinkles, clean negative space on cheeks, soft contour shading",
    config: {
      outputMode: "hectograph-purple",
      anchorWeight: 1.25,
      fineDetailGain: 0.95,
      flowShadingStrength: 0.65,
      localContrastBoost: 0.68,
      haloProtection: 2
    }
  },
  "aztec-geometric": {
    label: "Micro-Glyph & Ornamental",
    description: "Crisp single-pixel centerlines for intricate carvings and mandalas",
    config: {
      outputMode: "hectograph-purple",
      anchorWeight: 1.45,
      fineDetailGain: 1.5,
      flowShadingStrength: 0.2,
      localContrastBoost: 0.85,
      haloProtection: 1
    }
  },
  "one-bit": {
    label: "1-bit Black & White",
    description: "No grey tones. Shading becomes fine dots. Not yet validated on any specific thermal printer.",
    config: {
      outputMode: "thermal-binary",
      anchorWeight: 1.35,
      fineDetailGain: 1.1,
      flowShadingStrength: 0.35,
      localContrastBoost: 0.75,
      haloProtection: 2.2
    }
  }
};

// src/lib/classical-v3/prepare-input.ts
var V3_MAX_EDGE = 1024;
function fitWithin(srcW, srcH, maxEdge) {
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale))
  };
}

// scripts/v3/sweep-lib.ts
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class {
    data;
    width;
    height;
    constructor(a, b, c) {
      if (typeof a === "number") {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a;
        this.width = b;
        this.height = c;
      }
    }
  };
}
var PAIRS = ["hibiscus", "elder", "baby", "poseidon", "aztec", "portrait", "detail", "floral-back", "shoulder"];
var EXAMPLES = join(process.cwd(), "public/examples");
var find = (id, kind) => {
  for (const ext of ["webp", "jpg", "png"]) {
    try {
      readFileSync(join(EXAMPLES, `${id}-${kind}.${ext}`));
      return join(EXAMPLES, `${id}-${kind}.${ext}`);
    } catch {
    }
  }
  throw new Error(`missing ${id}-${kind}`);
};
async function load(path, maxEdge) {
  const m = await sharp(path).rotate().metadata();
  const sz = maxEdge ? fitWithin(m.width, m.height, maxEdge) : { width: m.width, height: m.height };
  const raw = await sharp(path).rotate().flatten({ background: "#ffffff" }).resize(sz.width, sz.height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  return { data: new Uint8ClampedArray(raw), width: sz.width, height: sz.height };
}
async function loadPairs() {
  const out = [];
  for (const id of PAIRS) out.push({ id, photo: await load(find(id, "before"), V3_MAX_EDGE), ref: await load(find(id, "after")) });
  return out;
}
var presetConfig = (id) => ({ ...STENCIL_V3_PRESETS[id].config });

// scripts/v3/source-probe.ts
var pairs = await loadPairs();
for (const p of pairs.filter((x) => ["hibiscus", "aztec", "portrait"].includes(x.id))) {
  let afterHess = null, afterEdges = null;
  renderHectographStencilV3(
    { data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height },
    { ...presetConfig("tattoo-clean"), inkBudget: 0.3, broadDoG: false, hessianSigma32: false, debugAnchorSource2: (a) => afterHess = a, debugAnchorSource: (a) => afterEdges = a }
  );
  const N = p.photo.width * p.photo.height;
  const c = (a, t) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (a[i] >= t) n++;
    return (n / N).toFixed(3);
  };
  console.log(`${p.id.padEnd(9)} Hessian sigma1.9 only: >=0.3 ${c(afterHess, 0.3)}  >=0.5 ${c(afterHess, 0.5)}  | + step edges: >=0.3 ${c(afterEdges, 0.3)}  >=0.5 ${c(afterEdges, 0.5)}`);
}
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
