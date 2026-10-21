# Account menus and combined daily sales

The supplied 20 drinks are imported by migration `0006_outside_drinks.sql` into **เครื่องดื่มร้านค้านอก (ต้นขาม)**. Prices are stored in satang. The migration preserves existing edits, prices and sales when run again. Obvious spelling mistakes in water, blueberry soda, strawberry soda and lemon tea names are normalized.

In **Users → Add cash02 · Drinks** (`เพิ่มบัญชี cash02 · เครื่องดื่ม`), the username `cash02` and the drinks category are preselected. Choose a password of at least 12 characters and save to create the account. The shortcut does not create an account or set a password automatically. If `cash02` already exists, edit that account instead.

Each account has **Sell all products**, **Sell by selected categories**, or **Sell selected products**. Category mode automatically includes future products in the selected categories, including categories that are currently empty. Product mode selects individual items, with category checkboxes to select the current items in bulk. An empty selection permits no sales; existing accounts keep all products until explicitly restricted. The same category or product may be sold by multiple accounts. New products created by a cashier in product mode are added to that cashier's product assignment; products created by another account require explicit selection in product mode.

Assignments are saved as `Setting` records keyed by `user-products:<user ID>` and `user-categories:<user ID>`. Changes use the existing user permission checks, audit log and session invalidation. The catalogue filters products on the server, and checkout independently checks assignments inside its transaction. Existing per-terminal category restrictions also apply. Removing an account's assignment does not alter historical orders or their products.

Daily reports and daily report printouts continue to combine every account and terminal for the selected business day. Account product assignments affect what can be sold, not the report's totals. Optional report filters remain available for examining an individual cashier.
