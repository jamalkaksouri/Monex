import moment from "moment-jalaali";
import dayjs from "dayjs";
import jalaliday from "jalaliday";

dayjs.extend(jalaliday);

export const formatJalaliDate = (date, showTime = false) => {
  if (!date) return "";

  let m;

  // ✅ Handle both dayjs and moment objects
  if (date._isAMomentObject) {
    m = date; // moment object
  } else if (date.$L !== undefined || date.isValid?.()) {
    // dayjs object
    m = moment(date.toISOString());
  } else {
    m = moment(date.valueOf ? date.valueOf() : date);
  }

  if (!m.isValid()) return "";

  return showTime ? m.format("jYYYY/jMM/jDD HH:mm") : m.format("jYYYY/jMM/jDD");
};
