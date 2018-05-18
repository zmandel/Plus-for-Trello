/// <reference path="intellisense.js" />

var g_loaderStripe = {
    load: function () {
        var price = 9.99;
        var stripe = Stripe('pk_live_4kZi0Lw0rPUHuLsDb00UVPt8');
        var elements = stripe.elements();
        var style = {
            base: {
                color: '#32325d',
                lineHeight: '24px',
                fontSize: '16px',
                '::placeholder': {
                    color: '#CEDDED'
                }
            },
            invalid: {
                color: '#fa755a',
                iconColor: '#fa755a'
            }
        };

        var elemNum = document.getElementById('agile_quantity_stripe');
        var form = document.getElementById('agile-stripe-payment-form');
        var userTrello = document.getElementById('agile_userTrello_stripe').textContent;
        var liStripe = document.getElementById('agile_stripe_li').textContent;
        var bChanging = (liStripe != "");
        var quantityOrig = parseInt(elemNum.value || "0",10) || 0;

        function hiliteElem(elem, msTime, count, strClass) {
            var classBlink = (strClass ? strClass : "agile_box_input_hilite");
            msTime = msTime || 1500;
            elem.classList.add(classBlink);
            setTimeout(function () {
                elem.classList.remove(classBlink);
                if (count && count > 1) {
                    setTimeout(function () {
                        hiliteElem(elem, msTime,count - 1, strClass);
                    }, msTime);
                }
            }, msTime);
        }

        //review: code relies on whether button text contains "preview"
        function changeButtonText(bNeedsPreview) {
            var num = Math.floor(parseFloat(elemNum.value) || 0);
            var title = "Buy";
            var bShowPreviewData = false;
            var bAddBuyClass = true;
            
            if (num && num > 0) {
                if (bChanging) {
                    title = "Modify license";
                    if (quantityOrig > 0) {
                        var diff = num - quantityOrig;
                        if (bNeedsPreview) {
                            title = "Preview charges";
                            bAddBuyClass = false;
                        }
                        else {
                            if (diff > 0) {
                                title = "Modify: Add " + diff + " licenses";
                                bShowPreviewData = true;
                            }
                            else if (diff < 0) {
                                title = "Modify: Remove " + Math.abs(diff) + " licenses";
                                bShowPreviewData = true;
                            }
                        }
                    }
                }
                else
                    title = title + ": $" + (num * price).toFixed(2) + " yearly";
            } else if (num === 0) {
                title = "Remove subscription";
            }
            var buttonAction = document.getElementById('agile_stripe_paydialog_buy');
            buttonAction.textContent = title;

            document.getElementById('agile_stripe_modifyinfo_reply').style.display = (bShowPreviewData ? "block" : "none");
            if (bChanging)
                document.getElementById('agile_stripe_modifyinfo').style.display = (!bShowPreviewData ? "block" : "none");
            if (bAddBuyClass)
                buttonAction.classList.add("agile_dialog_stripeBuy");
            else
                buttonAction.classList.remove("agile_dialog_stripeBuy");
        }

        changeButtonText();

        elemNum.addEventListener("input", function (event) {
            changeButtonText(bChanging);
        });

        var card = elements.create('card', { style: style, hidePostalCode: true });
        card.mount('#agile-stripe-card-element');

        // Handle real-time validation errors from the card Element.
        card.addEventListener('change', function (event) {
            var displayError = document.getElementById('agile-stripe-card-errors');
            if (event.error) {
                displayError.textContent = event.error.message || "error";
            } else {
                displayError.textContent = '';
            }
        });

        var email = null;
        var quantity = null;
        var name = null;
        var proration_last = 0;

        function showOverlay(bShow) {
            var elem = document.getElementById('agile_stripe_overlay');
            elem.style.display = (bShow ? "block" : "none");
        }

        function enableElements(bEnable, bNeedPreview) {
            function enableByTag(tag) {
                var inputs = form.getElementsByTagName(tag);
                for (var i = 0; i < inputs.length; i++)
                    inputs[i].disabled = !bEnable;
            }

            enableByTag("input");
            enableByTag("button");
            showOverlay(!bEnable);

            if (bEnable)
                changeButtonText(bNeedPreview); //helps refresh state of show/hide elements in case of comming from an error
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            email = (document.getElementById('agile_email_stripe').value || "").trim();
            quantity = parseInt(document.getElementById('agile_quantity_stripe').value || 0, 10) || 0;
            name = (document.getElementById('agile_cardholdername_stripe').value  || "").trim();

            if (!email) {
                alert("Please type the license owner's email.");
                return false;
            }

            var iAtEmail = email.indexOf("@");
            if (iAtEmail <= 0) {
                alert("Please type a valid email address.");
                return false;
            }

            if (email.lastIndexOf(".") < iAtEmail) {
                alert("Please type a valid email address with a '.'");
                return false;
            }

            if (!name) {
                alert("Please type the license owner's name.");
                return false;
            }

            if (quantity == 0 && !confirm("Are you sure you want to remove the subscription?"))
                return false;

            document.getElementById('agile-stripe-card-errors').textContent = "";
            document.getElementById('agile_stripe_modifyinfo_reply').style.display = "none";
            enableElements(false);
            var textButton = document.getElementById('agile_stripe_paydialog_buy').textContent || "";
            if (textButton.toLowerCase().indexOf("preview")>=0) {
                serverTokenHandlerPreviewChange(userTrello, liStripe, quantity);
            } else {
                stripe.createToken(card).then(function (result) {
                    if (result.error) {
                        // Inform the user if there was an error
                        var errorElement = document.getElementById('agile-stripe-card-errors');
                        errorElement.textContent = result.error.message;
                        enableElements(true);
                    } else {   
                        serverTokenHandlerCreateModify(result.token);
                    }
                });
            }
            return false;
        });

        function serverTokenHandlerPreviewChange(userTrello, liStripe, quantity) {
            var xhr = new XMLHttpRequest();

            // Bind the FormData object and the form element
            var fd = new FormData(form);
            var i = 0;
            var strParams = "?li=" + encodeURIComponent(liStripe) + "&quantity=" + quantity.toString()+ "&userTrello=" + encodeURIComponent(userTrello);
            
            function handleError(val) {
                var iColon = val.indexOf(":");
                var displayError = document.getElementById('agile-stripe-card-errors');
                if (iColon > 0)
                    val = val.substr(iColon + 1, val.length) + " (" + val.substr(0, iColon) + ")";
                displayError.textContent = val || "error";
                enableElements(true, true);
            }

            xhr.addEventListener("load", function (event) {
                var val = event.target.responseText;

                if (val.indexOf("error") == 0) {
                    handleError(val);
                    return;
                } else if (val.indexOf("sub-change-preview") == 0) {
                    //server returns sub-change-preview:cost:proration_date:bTrial
                    var params = val.split(":");
                    if (params.length == 5) {
                        var cost = ((parseInt(params[1], 10) || 0) / 100);
                        var strCost = Math.abs(cost).toFixed(2);
                        proration_last = parseInt(params[2], 10) || 0; //in seconds
                        var bTrial = (params[3] == "1");
                        var msPeriodEnd = parseInt(params[4], 10) || 0;
                        var elemInfo = document.getElementById('agile_stripe_modifyinfo_reply');
                        var strInfo = "Almost done! Click the Modify button to finish. ";
                        var strDateEnd = new Date(msPeriodEnd).toLocaleDateString();
                        if (bTrial)
                            strInfo += "Then once the trial period ends you will be charged <b>$" + strCost + "</b> instead of the previous pending charge.";
                        else {
                            if (cost > 0)
                                strInfo += "Then you will be charged an adjustment of <b>$" + strCost + "</b> for the current yearly period.<br>Afterwards, on your next yearly period ("+strDateEnd+") the subscription will be <b>$" + (quantity * price).toFixed(2)+"</b>.";
                            else
                                strInfo += "Then your next yearly subscription invoice ("+strDateEnd+") will be <b>$" + (quantity * price).toFixed(2) +
                                    "</b>.<br>Additionally, that next invoice will receive a credit of <b>$" + strCost + "</b> for unused license time this period.";
                        }
                        elemInfo.innerHTML = strInfo;
                        enableElements(true);
                    } else {
                        handleError("Invalid server response");
                        return;
                    }
                } else {
                    handleError("Invalid server response");
                    return;
                }
            });


            xhr.addEventListener("error", function (event) {
                var displayError = document.getElementById('agile-stripe-card-errors');
                displayError.textContent = event.target.responseText || "error";
                enableElements(true, true);
            });

            xhr.open("GET", "https://us-central1-plusfortrelloapp.cloudfunctions.net/calcpreview" + strParams);
            xhr.send();
        }

        function serverTokenHandlerCreateModify(token) {
            var xhr = new XMLHttpRequest();

            // Bind the FormData object and the form element
            var fd = new FormData(form);
            var i = 0;
            var strParams = "?cardholder-name=" + encodeURIComponent(name) + "&email=" + encodeURIComponent(email) + "&quantity=" + quantity.toString();
            strParams += ("&stripeToken=" + encodeURIComponent(token.id));
            strParams += ("&userTrello=" + encodeURIComponent(userTrello));
            strParams += ("&liStripe=" + encodeURIComponent(liStripe));
            strParams += ("&prorate=" + proration_last.toString());

            xhr.addEventListener("load", function (event) {
                var val = event.target.responseText;
                var iColon = val.indexOf(":");

                if (val.indexOf("error") == 0) {
                    var displayError = document.getElementById('agile-stripe-card-errors');
                    if (iColon > 0)
                        val = val.substr(iColon + 1, val.length) + " (" + val.substr(0, iColon) + ")";
                    displayError.textContent = val || "error";
                    enableElements(true, true);
                    return;
                }
                var params = val.split(":");
                var strLicense = params[1];
                var msStart = parseInt(params[2], 10) || 0;
                document.getElementById("agile_stripe_modifyinfo").style.display = "none";

                if (quantity > 0) {
                    document.getElementById("agile_stripe_licence").value = ("https://trello.com/plus-license/" + userTrello + "/" + strLicense);
                    document.getElementById("agile_stripe_startdate").textContent = ((new Date(msStart)).toLocaleDateString());
                    document.getElementById("agile_stripe_licence_info").style.display = "block";
                }


                var elemSensitive = document.getElementById("agile_stripe_postpayhide");
                elemSensitive.parentNode.removeChild(elemSensitive);
                document.getElementById("agile_stripe_ok").style.display = "block";
                showOverlay(false);
                if (quantity == 0)
                    alert("License removed.");
                window.postMessage({
                    type: 'agile_stripe_data',
                    license: {
                        msCreated: msStart,
                        li: strLicense,
                        userTrello: userTrello,
                        emailOwner: email,
                        quantity: quantity,
                        nameCardOwner: name
                    }
                },
                   '*' /* targetOrigin: any */);
            });


            xhr.addEventListener("error", function (event) {
                var displayError = document.getElementById('agile-stripe-card-errors');
                displayError.textContent = event.target.responseText || "error";
                enableElements(true, true);
            });

            xhr.open("GET", "https://us-central1-plusfortrelloapp.cloudfunctions.net/setlic" + strParams);
            xhr.send();
        }

        return this;
    }
}.load();


