# STANDBY buffer decision

Buffer 2 remains the final recommendation.

Measured representative immutable package bytes were approximately 365,712 for buffer 1 and 731,424 for buffer 2. In the injected scenario, activation consumed one ready package and the next generation attempt crashed after map encoding. Buffer 1 fell to zero; buffer 2 retained one immediately usable package while the deterministic retry recovered.

The second package adds no lifecycle state and only one controller count target. It does not authorize automatic publication or activation. Its small storage overhead is justified by eliminating the single-failure player-wait window.

Operational alerts warn when the buffer stays below 2 for five minutes and become critical when it reaches zero while placement capacity is low.
