**free
ctl-opt dftactgrp(*no) actgrp(*caller);

dcl-ds value qualified template;
  fixed char(16);
  shortText varchar(32 : 2);
  longText varchar(32 : 4);
  integer int(10);
  amount packed(31 : 9);
  numbers int(10) dim(3);
end-ds;
dcl-pr CTMap int(10) extproc('CTMap');
  payload likeds(value);
end-pr;
dcl-pi *n;
  payload likeds(value);
end-pi;
CTMap(payload);
*inlr = *on;
