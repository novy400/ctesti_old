**free
ctl-opt dftactgrp(*no) actgrp(*caller);
dcl-pi *n;
  mode char(1) const;
end-pi;
dcl-pr nested extpgm('QTEMP/CT10NEST');
end-pr;
dcl-pr send extpgm('QSYS/QMHSNDPM');
  id char(7) const;
  file char(20) const;
  data char(32767) const options(*varsize);
  size int(10) const;
  kind char(10) const;
  stack char(10) const;
  counter int(10) const;
  key char(4);
  error char(8);
end-pr;
dcl-s key char(4);
dcl-s error char(8) inz(*allx'00');
dcl-s i int(10);
dcl-s volume char(6000) inz(*all'x');
select;
when mode = 'A';
  emit('CT10:first');
  nested();
when mode = 'B';
  emit('CT10:second');
when mode = 'E';
  emit('CT10:before-error');
  send('CPF9898': 'QCPFMSG   QSYS      ': 'CT10:escape': 11:
    '*ESCAPE': '*PGMBDY': 1: key: error);
when mode = 'M';
  for i = 1 to 10001;
    emit('CT10:volume');
  endfor;
when mode = 'V';
  for i = 1 to 1500;
    send('CT10001': 'CT10MF    QTEMP     ': volume: 4000:
      '*INFO': '*EXT': 0: key: error);
  endfor;
when mode = 'T';
  send('': '': volume: 6000:
    '*INFO': '*EXT': 0: key: error);
endsl;
*inlr = *on;
return;
dcl-proc emit;
  dcl-pi *n;
    text char(256) const;
  end-pi;
  send('CPF9898': 'QCPFMSG   QSYS      ': text:
    %len(%trimr(text)): '*INFO': '*EXT': 0: key: error);
end-proc;
