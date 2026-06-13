#!/usr/bin/env python3
import argparse
import gzip
import re
import sys

# Regex to parse BND (breakend) mate information from ALT column
BND_PATTERN = re.compile(r'[\[\]]([^:]+):(\d+)[\[\]]')

def parse_vcf(vcf_path, tsv_path):
    print(f"Opening VCF file: {vcf_path}")
    
    # Determine if file is gzipped or plain text
    open_func = gzip.open if vcf_path.endswith('.gz') else open
    mode = 'rt' if vcf_path.endswith('.gz') else 'r'
    
    header = [
        "SV_ID",
        "Chrom1",
        "Pos1",
        "Chrom2",
        "Pos2",
        "SV_Type",
        "SV_Length",
        "Copy_Number",
        "Support_Reads",
        "Ref_Reads",
        "Filter",
        "Insertion_Seq"
    ]
    
    records_processed = 0
    records_written = 0
    
    try:
        with open_func(vcf_path, mode, encoding='utf-8') as f_in, open(tsv_path, 'w', encoding='utf-8') as f_out:
            # Write header
            f_out.write("\t".join(header) + "\n")
            
            # We need to find the column headers first
            sample_cols = []
            for line in f_in:
                if line.startswith('##'):
                    continue
                if line.startswith('#'):
                    # This is the header line
                    headers = line.strip().split('\t')
                    if len(headers) > 9:
                        sample_cols = headers[9:]
                    continue
                
                # Parse data line
                fields = line.strip().split('\t')
                if len(fields) < 8:
                    continue
                
                records_processed += 1
                
                chrom1 = fields[0]
                pos1 = int(fields[1])
                sv_id = fields[2]
                ref = fields[3]
                alt = fields[4]
                qual = fields[5]
                filt = fields[6]
                info_str = fields[7]
                
                # Parse INFO column
                info_dict = {}
                for item in info_str.split(';'):
                    if '=' in item:
                        k, v = item.split('=', 1)
                        info_dict[k] = v
                    else:
                        info_dict[item] = True
                
                # Extract SV type
                sv_type = info_dict.get('SVTYPE', 'UNKNOWN')
                if sv_type == 'UNKNOWN':
                    if alt.startswith('<') and alt.endswith('>'):
                        sv_type = alt[1:-1]
                    elif '[' in alt or ']' in alt:
                        sv_type = 'BND'
                
                # Determine second breakpoint coordinates
                chrom2 = chrom1
                pos2 = "N/A"
                
                # Check for BND / translocation
                bnd_match = BND_PATTERN.search(alt)
                if bnd_match:
                    chrom2 = bnd_match.group(1)
                    pos2 = bnd_match.group(2)
                    sv_type = 'BND'
                elif 'END' in info_dict:
                    pos2 = info_dict['END']
                
                # Extract SV length
                sv_len = "N/A"
                if 'SVLEN' in info_dict:
                    try:
                        sv_len = str(abs(int(info_dict['SVLEN'])))
                    except ValueError:
                        sv_len = info_dict['SVLEN']
                
                # Extract Copy Number
                copy_number = info_dict.get('CN', 'N/A')
                
                # Extract support reads (RE or SUPPORT)
                support_reads = "N/A"
                if 'RE' in info_dict:
                    support_reads = info_dict['RE']
                elif 'SUPPORT' in info_dict:
                    support_reads = info_dict['SUPPORT']
                
                # Extract reference and alternative reads from Genotype field if available
                ref_reads = "N/A"
                if len(fields) >= 10: # We have a sample column
                    format_str = fields[8]
                    sample_str = fields[9]
                    
                    format_keys = format_str.split(':')
                    sample_vals = sample_str.split(':')
                    format_dict = dict(zip(format_keys, sample_vals))
                    
                    # In Sniffles, DV represents variant support, DR represents reference support
                    if 'DV' in format_dict:
                        support_reads = format_dict['DV']
                    if 'DR' in format_dict:
                        ref_reads = format_dict['DR']
                    if 'CN' in format_dict and copy_number == 'N/A':
                        copy_number = format_dict['CN']
                
                # Extract Insertion sequence if available
                insertion_seq = "N/A"
                if sv_type == 'INS':
                    if not alt.startswith('<'):
                        insertion_seq = alt
                    elif 'SEQ' in info_dict:
                        insertion_seq = info_dict['SEQ']
                
                # Prepare and write row
                row = [
                    sv_id,
                    chrom1,
                    str(pos1),
                    chrom2,
                    str(pos2),
                    sv_type,
                    sv_len,
                    copy_number,
                    support_reads,
                    ref_reads,
                    filt,
                    insertion_seq
                ]
                
                f_out.write("\t".join(row) + "\n")
                records_written += 1
        
        print(f"Success! Processed {records_processed} records, wrote {records_written} to {tsv_path}")
    except FileNotFoundError:
        print(f"Error: The file '{vcf_path}' was not found.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Extract structural variants from a Sniffles VCF to a TSV file.")
    parser.add_argument("input_vcf", help="Path to the input VCF file (can be gzipped .vcf.gz)")
    parser.add_argument("output_tsv", help="Path to the output TSV file to be created")
    
    args = parser.parse_args()
    parse_vcf(args.input_vcf, args.output_tsv)
