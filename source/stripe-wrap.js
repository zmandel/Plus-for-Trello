/// <reference path="intellisense.js" />

var g_loaderStripe = {
    load: function () {
        var stripe = Stripe('pk_test_mLo8JETttIstZNGCiBz6PAaX');
        var elements = stripe.elements();
        var style = {
            base: {
                color: '#32325d',
                lineHeight: '24px',
                fontSize: '16px',
                '::placeholder': {
                    color: '#aab7c4'
                }
            },
            invalid: {
                color: '#fa755a',
                iconColor: '#fa755a'
            }
        };


        var card = elements.create('card', { style: style, hidePostalCode: true });
        card.mount('#card-element');

        // Handle real-time validation errors from the card Element.
        card.addEventListener('change', function (event) {
            var displayError = document.getElementById('card-errors');
            if (event.error) {
                displayError.textContent = event.error.message;
            } else {
                displayError.textContent = '';
            }
        });

        // Handle form submission
        var form = document.getElementById('payment-form');
        form.addEventListener('submit', function (event) {
            event.preventDefault();

            stripe.createToken(card).then(function (result) {
                if (result.error) {
                    // Inform the user if there was an error
                    var errorElement = document.getElementById('card-errors');
                    errorElement.textContent = result.error.message;
                } else {
                    // Send the token to your server
                    stripeTokenHandler(result.token);
                }
            });
        });

        function enableElements(bEnable) {
            function enableByTag(tag) {
                var inputs = form.getElementsByTagName(tag);
                for (var i = 0; i < inputs.length; i++)
                    inputs[i].disabled = !bEnable;
            }

            enableByTag("input");
            enableByTag("button");
        }

        function stripeTokenHandler(token) {
            // Insert the token ID into the form so it gets submitted to the server
            var form = document.getElementById('payment-form');
            var userTrello = document.getElementById('agile_userTrello_stripe').textContent;
            function sendData() {
                var xhr = new XMLHttpRequest();

                // Bind the FormData object and the form element
                var fd = new FormData(form);
                var i = 0;
                var strParams = "?";
                var pair;
                for (var pair of fd.entries()) {
                    if (i > 0)
                        strParams += "&";
                    strParams += (pair[0] + "=" + encodeURIComponent(pair[1]));
                    i++;
                }
                
                strParams += ("&stripeToken=" + encodeURIComponent(token.id));
                strParams += ("&userTrello=" + encodeURIComponent(userTrello));
                xhr.addEventListener("load", function (event) {
                    var val = event.target.responseText;
                    var iColon = val.indexOf(":");
                    
                    if (val.indexOf("error") == 0) {
                        var displayError = document.getElementById('card-errors');
                        displayError.textContent = val;
                        enableElements(true);
                        return;
                    }
                    var params = val.split(":");
                    $("#agile_stripe_licence").val(params[1]);
                    $("#agile_stripe_startdate").val(new Date(params[2]));
                    $("#agile_stripe_licence_info").show();
                });

                
                xhr.addEventListener("error", function (event) {
                    var displayError = document.getElementById('card-errors');
                    displayError.textContent = event.target.responseText;
                    enableElements(true);
                });

                document.getElementById('card-errors').textContent = "";
                enableElements(false);
                xhr.open("GET", "https://us-central1-plusfortrelloapp.cloudfunctions.net/setlic" + strParams);
                xhr.send();
            }
 
            sendData();
            //document.getElementById("agile_cancel_stripe_buy").click();
            return;
        }

        return this;
    }
}.load();


