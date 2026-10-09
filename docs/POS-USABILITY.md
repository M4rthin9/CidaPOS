The sales screen now supports an exact barcode or SKU scan followed by Enter. Searches span all categories, while choosing a category clears the search. Unknown, duplicate and unavailable codes require the operator to select or check the item. Desktop focus returns to the search box after closing a sales dialog. F8/F9 remain usable from the search field, while category shortcuts never consume characters typed in notes.

On phones, the bottom bar switches between products and the bill without scrolling through the menu. Quantity controls and cash presets have larger touch targets. Removing one line offers Undo with its original quantity, modifiers and note; checkout, parking and terminal changes clear this undo state.

Cash payments show a shortfall before confirmation and reject blank or invalid precision. Enter on a payment-method button selects the method; only Enter in a payment input confirms. Existing payment keys and pending requests remain intact across a refresh, so retries continue the same checkout. A persistent sale summary retains the bill number, queue and change even when printing updates the status notice. Drawer-only failures use their explicit already-printed message.

The screen shows a reconnect action when offline and retains the local bill. It blocks checkout while disconnected. Staff can tap printer status to refresh it or open the Thai three-step help panel. These checks never create a sale or send receipt content.

Validation uses mocked browser checkout/printing routes, including pending-request recovery and mobile layout checks, plus existing financial, D1/R2 and iMin/Codesoft tests. Production verification reads the deployed UI and product catalog without creating sales or activating a physical printer/drawer.
