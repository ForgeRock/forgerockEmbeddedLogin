(function () {
    "use strict";

    /**
     * Module used to encapsulate interaction with ForgeRock Access Management's authentication API
     * @module ForgeRockEmbeddedLogin
     */
    let findName = (array, name) => array.reduce(
        (found, item) => found || (item.name === name && item), false
    );

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.authenticateUrl - The URL to the AM authentication API, with all options included within the query string
     * @param {function} options.postRenderHandler - Function to call after the login form is rendered on the page. Includes  (header, stage, template) arguments
     * @param {function} options.successHandler - Function to call whenever authentication succeeds
     * @param {function} options.failureHandler - Function to call whenever authentication fails
     * @param {Object} options.loginElement - Place in the DOM used to render the credential input fields
     */
    let embeddedLogin = function (options) {
        this.authenticateUrl = options.authenticateUrl;
        this.postRenderHandler = options.postRenderHandler;
        this.successHandler = options.successHandler;
        this.failureHandler = options.failureHandler;
        this.loginElement = options.loginElement;
        return this;
    };

    /** @function handleCallbackResponse
     * Unlikely to need to be overridden or called directly. This function is called
     * by the default implementation of startLogin and submitCallbacks. It reacts to
     * the response produced from either by delegating the work to the proper handler,
     * based on the state determined.
     */
    embeddedLogin.prototype.handleCallbackResponse = function () {
        if (this.success() && this.successHandler) {
            this.successHandler();
        } else if (this.failure() && this.failureHandler) {
            this.failureHandler();
        } else {
            this.renderAllCallbacks()
                .then((loginContent) => this.renderHandler(loginContent))
                .then(() => {
                    if (this.postRenderHandler) {
                        this.postRenderHandler(
                            this.currentCallbacks.header,
                            this.currentCallbacks.stage,
                            this.currentCallbacks.template
                        );
                    }
                });
        }
        return this;
    };

    /** @function startLogin
     * This function *MUST* be called by your application, when you are ready to start
     * interacting with the AM authentication API. It is unlikely that you will need
     * to override it. It makes XHR calls to the authenticateUrl without any credentials
     * supplied (besides the cookie that may be present in the case of an established session).
     */
    embeddedLogin.prototype.startLogin = function () {
        this.currentCallbacks = {};
        return this.submitCallbacks();
    };

    /** @function success
     * How to determine if the authentication has succeeded. Unlikely to need to be overridden.
     */
    embeddedLogin.prototype.success = function () {
        return !!this.currentCallbacks.tokenId;
    };

    /** @function failure
     * How to determine if the authentication has failed. Unlikely to need to be overridden.
     */
    embeddedLogin.prototype.failure = function () {
        return typeof this.currentCallbacks.authId === "undefined" &&
            this.currentCallbacks.code === 401;
    };

    /** @function renderHandler
     * Binds the content produced from renderAllCallbacks to the DOM. The default implementation
     * merely sets the innerHTML and attaches an onsubmit handler to the form within the content.
     *
     * You may want to override this if you want more control over how the fields are inserted into
     * the DOM. Be sure to set the onsubmit handler for the form to call out to `handleLoginSubmit`
     * if you do override it.
     */
    embeddedLogin.prototype.renderHandler = function (loginContent) {
        if (this.loginElement) {
            // clear the content from this.loginElement
            let cNode = this.loginElement.cloneNode(false);
            this.loginElement.parentNode.replaceChild(cNode, this.loginElement);
            this.loginElement = cNode;
            this.loginElement.appendChild(loginContent);

            let form = this.loginElement.getElementsByTagName("form")[0];
            form.onsubmit = this.handleLoginSubmit.bind(this);
        }
        return this;
    };

    /** @function renderAllCallbacks
     * Loops over every callback returned by the authentication API, calling the renderCallback
     * function for each of them. The default function adds a ConfirmationCallback if there isn't
     * normally one present in the response.
     *
     * You may want to override this function if you want to change the behavior for that added
     * ConfirmationCallback.
     */
    embeddedLogin.prototype.renderAllCallbacks = function () {
        var needsLoginButton = !this.currentCallbacks.callbacks.reduce((result, callback) =>
                result || ["ConfirmationCallback","PollingWaitCallback","RedirectCallback"].indexOf(callback.type) !== -1,
            false),
            loginCallback = {
                input: {
                    index: this.currentCallbacks.callbacks.length,
                    name: "loginButton",
                    value: 0
                },
                output: [{
                    name: "options",
                    value: [ this.getLoginButtonText() ]
                }],
                type: "ConfirmationCallback"
            };

        return Promise.all(
            (needsLoginButton ? this.currentCallbacks.callbacks.concat(loginCallback) : this.currentCallbacks.callbacks)
                .map((callback, index) => this.renderCallback(callback, index))
        )
            .then(this.joinRenderedCallbacks);
    };

    /** @function getLoginButtonText
     * Provides a default English-language option for the login button produced by the
     * `renderAllCallbacks` function. You may want to override this function if you want
     * to have support for internationalization.
     */
    embeddedLogin.prototype.getLoginButtonText = function () {
        return "Login";
    };

    /** @function handleLoginSubmit
     * The default function supplied as the "onsubmit" handler for the input form. Assumes
     * the input fields are named like so:
     * callback_0
     * callback_1
     * etc...
     *
     * Maps the value from those inputs into the `currentCallbacks` structure last fetched.
     *
     * You will need to override this if the naming convention for your inputs is different.
     */
    embeddedLogin.prototype.handleLoginSubmit = function (event) {
        event.preventDefault();
        for (var entry of (new FormData(event.currentTarget))) {
            let callback_entry = entry[0].match(/^callback_(\d+)$/);
            if (callback_entry) {
                this.currentCallbacks.callbacks[parseInt(callback_entry[1], 10)].input[0].value = entry[1];
            }
        }
        return this.submitCallbacks();
    };

    /** @function submitCallbacks
     * This function is similar to `startLogin`, except it supplies the gathered
     * inputs captured in the `currentCallbacks` data. It makes XHR calls to the
     * `authenticateUrl` and uses `handleCallbackResponse` afterwards.
     */
    embeddedLogin.prototype.submitCallbacks = function () {
        return fetch(this.authenticateUrl, {
            mode: "cors",
            method: "POST",
            credentials: "include",
            headers: {
                "accept-api-version": "protocol=1.0,resource=2.1",
                "content-type": "application/json"
            },
            body: JSON.stringify(this.currentCallbacks)
        })
            .then((resp) => resp.json())
            .then((jsonResp) => {
                this.currentCallbacks = jsonResp;
                return this.currentCallbacks;
            })
            .then(() => this.handleCallbackResponse());
    };

    /** @function renderCallback
     * Delegates the current callback to the appropriate type-specific rendering function.
     * It's not expected that this should need to be overriden; the various callback-specific
     * logic included within this function should be generally-applicable.
     */
    embeddedLogin.prototype.renderCallback = function (callback, index) {
        let prompt = "",
            promptOutput = findName(callback.output, "prompt");
        if (promptOutput && promptOutput.value && promptOutput.value.length) {
            prompt = promptOutput.value.replace(/:$/, "");
        }

        switch (callback.type) {
        case "NameCallback": return this.renderNameCallback(callback, index, prompt);
        case "PasswordCallback": return this.renderPasswordCallback(callback, index, prompt);
        case "TextInputCallback": return this.renderTextInputCallback(callback, index, prompt);
        case "TextOutputCallback":
            var type = findName(callback.output, "messageType"),
                message = findName(callback.output, "message"),
                messageTypeMap = {
                    0: "INFORMATION",
                    1: "WARNING",
                    2: "ERROR"
                };

            // Magic number 4 is for a <script>, taken from ScriptTextOutputCallback.java
            if (type.value === "4") {
                return this.renderTextOutputScript(index, message.value);
            } else {
                return this.renderTextOutputMessage(index, message.value, messageTypeMap[type.value]);
            }
        case "ConfirmationCallback":
            var options = findName(callback.output, "options");

            if (options && options.value !== undefined) {
                // If there is only one option then mark it as default.
                let defaultOption = options.value.length > 1
                    ? findName(callback.output, "defaultOption") : { "value": 0 };

                return Promise.all(
                    options.value.map((option, key) =>
                        this.renderConfirmationCallbackOption(option, index, key, defaultOption && defaultOption.value === key)
                    )
                );
            } else {
                return Promise.all([]);
            }
        case "ChoiceCallback":
            var choiceOutput = findName(callback.output, "choices");
            if (choiceOutput && choiceOutput.value !== undefined) {
                let choices = choiceOutput.value.map((option, key) => ({
                    active: callback.input.value === key,
                    key,
                    value: option
                }));
                return this.renderChoiceCallback(callback, index, prompt, choices);
            } else {
                return Promise.all([]);
            }
        case "HiddenValueCallback": return this.renderHiddenValueCallback(callback, index);
        case "RedirectCallback":
            var redirectUrl = findName(callback.output, "redirectUrl");
            var redirectMethod = findName(callback.output, "redirectMethod");
            var redirectData = findName(callback.output, "redirectData");

            var form = document.createElement("form");
            form.action = redirectUrl.value;
            form.method = redirectMethod.value;
            if (redirectData && redirectData.value) {
                redirectData.value.forEach((v, k) => {
                    let input = document.createElement("input");
                    input.type = "hidden";
                    input.name = k;
                    input.value = v;
                    form.appendChild(input);
                });
            }
            document.getElementsByTagName("body")[0].appendChild(form);
            form.submit();
            // no return from here, expectation is the page transitions to the redirectUrl
            break;
        case "PollingWaitCallback":
            var pollingWaitTimeoutMs = findName(callback.output, "waitTime").value;

            setTimeout(() => {
                this.pollingInProgress = true;
                // figure out how to handle this later
            }, pollingWaitTimeoutMs);
            return this.renderPollingWaitCallback(callback, index, findName(callback.output, "message").value);
        case "ReCaptchaCallback":
            return this.renderReCaptchaCallback(callback, index, prompt);
        default: return this.renderUnknownCallback(callback, index, prompt);
        }
    };

    /** @function joinRenderedCallbacks
     * @param {Array} renderedCallbacks - Array of resolved values which have been produced by the `renderCallback` method
     * @returns {Promise} - resolved when the full content of the form to render is available. Promise is resolved with DOM Node representing the complete login form
     *
     * It is expected that this function will be overridden. The default implementation is very simple, and merely adds
     * <form> tags around the callbacks, along with breaks between them. If you want more sophisticated markup around your
     * input controls, you can provide it here.
     */
    embeddedLogin.prototype.joinRenderedCallbacks = function (renderedCallbacks) {
        let form = document.createElement("form");
        renderedCallbacks
            // flatten callback results
            .reduce((result, item) => result.concat(item), [])
            .forEach((callback) => {
                form.appendChild(callback);
                form.appendChild(document.createElement("br"));
            });
        return Promise.resolve(form);
    };

    /** @function renderNameCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} prompt - Text to present to the user describing the callback
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * It is expected that this function will be overridden. The default implementation is a very simple text input field.
     */
    embeddedLogin.prototype.renderNameCallback = function (callback, index, prompt) {
        let el = document.createElement("div");
        el.innerHTML = `<input type="text" name="callback_${index}" value="${callback.input[0].value}" placeholder="${prompt}">`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderPasswordCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} prompt - Text to present to the user describing the callback
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * It is expected that this function will be overridden. The default implementation is a very simple password input field.
     */
    embeddedLogin.prototype.renderPasswordCallback = function (callback, index, prompt) {
        let el = document.createElement("div");
        el.innerHTML = `<input type="password" name="callback_${index}" value="${callback.input[0].value}" placeholder="${prompt}">`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderTextInputCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} prompt - Text to present to the user describing the callback
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * It is expected that this function will be overridden. The default implementation is a very simple textarea input field.
     */
    embeddedLogin.prototype.renderTextInputCallback = function (callback, index, prompt) {
        let el = document.createElement("div");
        el.innerHTML = `<textarea name="callback_${index}">${callback.input[0].value}</textarea>`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderTextOutputScript
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} messageValue - Script to be executed
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This is the special-case of a "TextOutputCallback" that is of type "4" - indicating a script.
     * This adds client-side JavaScript code to execute in the browser. You shouldn't have
     * to override this under normal circumstances.
     */
    embeddedLogin.prototype.renderTextOutputScript = function (index, messageValue) {
        let el = document.createElement("script");
        el.innerHTML = messageValue;
        return Promise.resolve(el);
    };

    /** @function renderTextOutputMessage
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} messageValue - Script to be executed
     * @param {string} typeValue - type of output message [INFORMATION,WARNING,ERROR]
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This is the general-case of a "TextOutputCallback".
     * This outputs a non-interactive text message, of a particular type.
     */
    embeddedLogin.prototype.renderTextOutputMessage = function (index, messageValue, typeValue) {
        let el = document.createElement("div");
        el.innerHTML = `<div id="callback_${index}" class="${typeValue}">${messageValue}</div>`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderConfirmationCallbackOption
     * @param {string} option - value of this particular option
     * @param {number} index - ordinal position of this callback relative to others
     * @param {number} key - ordinal position of this option relative to others
     * @param {boolean} isDefault - true if this option is the "default" one; should only be one within this callback set to true
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This renders one particular confirmation callback option. It is one value within a set,
     * the totality of which represents a single confirmation callback.
     */
    embeddedLogin.prototype.renderConfirmationCallbackOption = function (option, index, key, isDefault) {
        let el = document.createElement("div");
        el.innerHTML = `<input name="callback_${index}" type="submit" index="${key}" value="${option}">`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderChoiceCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} prompt - Text to present to the user describing the callback
     * @param {Array} choices - List of choices for this callback
     * @param {string} choices[].key - the value to be submitted for this callback if it is selected
     * @param {boolean} choices[].active - the default value to be selected
     * @param {string} choices[].value - the content to display to the user representing this choice
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This renders a set of choices, intended for the user to choose between.
     */
    embeddedLogin.prototype.renderChoiceCallback = function (callback, index, prompt, choices) {
        let el = document.createElement("div");
        el.innerHTML = `<div><label for="callback_${index}" id="label_callback_${index}">${prompt}</label>
            <select name="callback_${index}" id="callback_${index}">
            ${choices.map((choice) => `<option value="${choice.key}" ${choice.active ? "selected" : ""}>${choice.value}</option>`)}
            </select></div>`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderHiddenValueCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This includes a hidden value within the form.
     */
    embeddedLogin.prototype.renderHiddenValueCallback = function (callback, index) {
        let el = document.createElement("div");
        el.innerHTML = `<input type="hidden" id="${callback.input.value}" aria-hidden="true" name="callback_${index}" value="" />`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderPollingWaitCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} messageValue - Text to be displayed to the user while the client waits
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * This displays text to the user while waiting for something to happen out-of-channel.
     */
    embeddedLogin.prototype.renderPollingWaitCallback = function (callback, index, message) {
        let el = document.createElement("div");
        el.innerHTML = `<input type="hidden" id="${callback.input.value}" aria-hidden="true" name="callback_${index}" value="" />`;
        return Promise.resolve(el.firstElementChild);
    };

    /** @function renderReCaptchaCallback
     * @param {string} option - value of this particular option
     * @param {number} index - ordinal position of this callback relative to others
     * @param {number} key - ordinal position of this option relative to others
     * @returns {Promise} - resolved when the full content of this callback is available
     *
     * This renders ReCaptchaCallback
     */
    embeddedLogin.prototype.renderReCaptchaCallback = function (option, index, key) {
        var reCaptchaSiteKey = option.output[0].value,
            reCaptchaContainer = document.createElement("div"),
            reCaptchaApiImport = document.createElement("script"),
            reCaptchaScript = document.createElement("script"),
            reCaptchaStyle = document.createElement("style"),
            reCaptchaHTML = document.createElement("div"),
            reCaptchaInput = document.createElement("input"),
            reCaptchaScriptSource = `
                var loginButton = document.querySelectorAll('input[type=submit]')[0],
                    callback_index = ${index},
                    /*
                        If callback_index is zero and the "name" attribute on loginButton is callback_1 we
                        know ReCaptcha is by itself on the page. In this case we will hide loginButton
                        and click it to submit the form automatically when ReCaptcha is complete.
                    */
                    standaloneMode = callback_index === 0 && loginButton && loginButton.name === "callback_1";

                if (standaloneMode) {
                    loginButton.style.display = "none";
                }

                function handleCaptchaCallback(response) {
                   document.getElementById("reCaptchaInput").value = response;

                   if (standaloneMode) {
                       loginButton.click();
                   }
                }
            `,
            reCaptchaStyleSource = `
                .g-recaptcha>div {
                    margin: auto;
                }
                .g-recaptcha>div>div {
                   display: inline-block;
                }
            `;

        // add the api link
        reCaptchaApiImport.src = "https://www.google.com/recaptcha/api.js";
        reCaptchaContainer.appendChild(reCaptchaApiImport);
        // add the script
        reCaptchaScript.innerHTML = reCaptchaScriptSource;
        reCaptchaContainer.appendChild(reCaptchaScript);
        // add the style
        reCaptchaStyle.innerHTML = reCaptchaStyleSource;
        reCaptchaContainer.appendChild(reCaptchaStyle);
        // define and add the g-recaptcha div
        reCaptchaHTML.className = "g-recaptcha";
        reCaptchaHTML.setAttribute("data-sitekey", reCaptchaSiteKey);
        reCaptchaHTML.setAttribute("data-callback", "handleCaptchaCallback");
        reCaptchaHTML.style = "margin-bottom: 5px;";
        reCaptchaContainer.appendChild(reCaptchaHTML);
        // define the reCaptchaInput
        reCaptchaInput.type = "hidden";
        reCaptchaInput.id = "reCaptchaInput";
        reCaptchaInput.name = `callback_${index}`;
        reCaptchaContainer.appendChild(reCaptchaInput);

        reCaptchaContainer.style = "display: inline;";

        return Promise.resolve(reCaptchaContainer);
    };

    /** @function renderUnknownCallback
     * @param {Object} callback - structure of data returned from authentication API for this specific callback type
     * @param {number} index - ordinal position of this callback relative to others
     * @param {string} prompt - Text to present to the user describing the callback
     * @returns {Promise} - resolved when the full content of this callback is available. Expected to be resolved with a DOM node
     *
     * Handler for an unknown callback type. By default it just uses the name callback.
     */
    embeddedLogin.prototype.renderUnknownCallback = function (callback, index, prompt) {
        return this.renderNameCallback(callback, index, prompt);
    };

    module.exports = embeddedLogin;

}());
